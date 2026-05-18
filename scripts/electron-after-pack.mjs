/**
 * electron-builder afterPack hook — sign embedded helper bundles that
 * electron-builder's own signing pass doesn't recurse into.
 *
 * Why this exists
 * ---------------
 * lexed embeds Contents/PlugIns/LexQuickLook.appex into the .app via
 * `extraFiles` in package.json. electron-builder's macOS signing pass
 * signs the parent .app but does NOT descend into PlugIns/*.appex, so
 * the embedded extension ships unsigned and macOS refuses to load it.
 * Quick Look integration for `.lex` / `.lexd` files in Finder /
 * `qlmanage` silently breaks at install time on user machines.
 *
 * afterPack is the canonical electron-builder lifecycle hook for this:
 * it runs BETWEEN pack and sign, so we sign the appex first and
 * electron-builder's later sign of the parent .app seals the appex's
 * signature in cleanly. Doing the equivalent work AFTER electron-
 * builder finished would invalidate the parent .app's notarization
 * (the historical workaround in lexed's old release.yml worked
 * because notarization was a separate step; in the canonical
 * arthur-debert/release workflow notarization is inline with build).
 *
 * Why the temp-keychain dance
 * ---------------------------
 * electron-builder sets up its temp keychain AT SIGN TIME, which is
 * AFTER afterPack runs. So we can't reuse it from here. We set up
 * our own dedicated keychain to source the Developer ID Application
 * identity, then sign the appex with `codesign --keychain <ours>`.
 * electron-builder's later pass creates its own keychain and signs
 * the parent .app — that's fine, the appex signature is already
 * embedded in the file by then.
 *
 * Why .mjs
 * --------
 * lexed's eslint.config.js has a `scripts/**/*.mjs` block that
 * provides Node globals + ESM sourceType. Naming the file `.mjs`
 * picks up that block automatically and avoids an eslint-config
 * edit. electron-builder 22+ supports ESM afterPack hooks natively.
 *
 * Env contract (set by arthur-debert/release/.github/workflows/
 * electron-app.yml's slice-1.5 credentials decode step):
 *   CSC_LINK            path to a .p12 file (set by the workflow)
 *   CSC_KEY_PASSWORD    password for the .p12
 *
 * Skips gracefully (logs and returns) when env vars aren't set —
 * local-dev builds without signing credentials still work.
 *
 * Refs:
 *   arthur-debert/release#67 — issue (resolved by this hook)
 *   arthur-debert/release#66 — slice 1.5 (where post-build was
 *     correctly rejected in favor of afterPack)
 *   electron-builder docs — https://www.electron.build/configuration/configuration#afterpack
 */

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execSync, execFileSync } from 'node:child_process'

export default async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return

  const cscLink = process.env.CSC_LINK
  const cscPassword = process.env.CSC_KEY_PASSWORD || ''
  if (!cscLink) {
    console.log('[afterPack] CSC_LINK not set — skipping QuickLook appex signing (local-dev build).')
    return
  }

  const tempDir = process.env.RUNNER_TEMP || '/tmp'

  // CSC_LINK can be a file path (workflow's decode step writes one),
  // a `data:application/x-pkcs12;base64,...` URI, or a bare base64
  // string. Normalize to a file path on disk.
  let certPath
  if (fs.existsSync(cscLink)) {
    certPath = cscLink
  } else if (cscLink.startsWith('data:')) {
    const b64 = cscLink.split(',')[1] || ''
    certPath = path.join(tempDir, 'after-pack-cert.p12')
    fs.writeFileSync(certPath, Buffer.from(b64, 'base64'))
  } else {
    certPath = path.join(tempDir, 'after-pack-cert.p12')
    fs.writeFileSync(certPath, Buffer.from(cscLink, 'base64'))
  }

  const appName = context.packager.appInfo.productFilename
  const appPath = path.join(context.appOutDir, `${appName}.app`)
  const appexPath = path.join(appPath, 'Contents', 'PlugIns', 'LexQuickLook.appex')

  if (!fs.existsSync(appexPath)) {
    console.log(`[afterPack] ${appexPath} not present — skipping`)
    return
  }

  // Dedicated temp keychain for this hook. electron-builder's own
  // keychain is set up at sign time (after this hook), so it isn't
  // available to us.
  const keychainPath = path.join(tempDir, 'after-pack.keychain-db')
  const keychainPassword = crypto.randomBytes(16).toString('hex')

  // Idempotent: remove a stale keychain from a previous run on the
  // same runner (rare on ephemeral runners, defensive otherwise).
  try {
    execSync(`security delete-keychain "${keychainPath}"`, { stdio: 'ignore' })
  } catch {
    // ignore — keychain may not exist on first run
  }

  execSync(`security create-keychain -p "${keychainPassword}" "${keychainPath}"`)
  execSync(`security set-keychain-settings -lut 3600 "${keychainPath}"`)
  execSync(`security unlock-keychain -p "${keychainPassword}" "${keychainPath}"`)
  execSync(`security import "${certPath}" -k "${keychainPath}" -P "${cscPassword}" -T /usr/bin/codesign`)
  execSync(`security set-key-partition-list -S apple-tool:,apple: -s -k "${keychainPassword}" "${keychainPath}"`)

  // Append the new keychain to the user's search list — codesign
  // won't find identities without this. Preserve the existing
  // entries (don't replace) so other tooling on the runner keeps
  // working.
  const existingKeychains = execSync('security list-keychains -d user', { encoding: 'utf-8' })
    .split('\n')
    .map(line => line.trim().replace(/^"|"$/g, ''))
    .filter(Boolean)
  const searchList = [keychainPath, ...existingKeychains].map(k => `"${k}"`).join(' ')
  execSync(`security list-keychains -d user -s ${searchList}`)

  // Find the Developer ID Application identity in our keychain.
  const findOut = execSync(
    `security find-identity -v -p codesigning "${keychainPath}"`,
    { encoding: 'utf-8' }
  )
  const match = findOut.match(/"(Developer ID Application[^"]+)"/)
  if (!match) {
    throw new Error(
      `[afterPack] no Developer ID Application identity in keychain. find-identity output:\n${findOut}`
    )
  }
  const identity = match[1]

  // Sign the appex with the same hardening flags electron-builder
  // will use for the parent .app (--options runtime --timestamp +
  // entitlements). codesign embeds the signature INTO the file, so
  // when electron-builder signs the parent .app later, the appex
  // signature is sealed in naturally.
  const entitlementsPath = path.resolve('resources/entitlements.mac.plist')
  if (!fs.existsSync(entitlementsPath)) {
    throw new Error(`[afterPack] entitlements file not found at ${entitlementsPath}`)
  }

  console.log(`[afterPack] signing ${appexPath} with ${identity}`)
  execFileSync('codesign', [
    '--force',
    '--sign', identity,
    '--options', 'runtime',
    '--timestamp',
    '--entitlements', entitlementsPath,
    '--keychain', keychainPath,
    appexPath,
  ], { stdio: 'inherit' })

  // Verify before declaring success — `codesign --verify` surfaces
  // problems that the sign step itself reports as success (broken
  // entitlements, missing required keys, etc.).
  execFileSync('codesign', ['--verify', '--verbose', appexPath], { stdio: 'inherit' })

  console.log('[afterPack] QuickLook appex signed and verified')
}
