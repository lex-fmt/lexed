import Cocoa
import QuickLookUI
import UniformTypeIdentifiers

class PreviewProvider: QLPreviewProvider {

    func providePreview(for request: QLFilePreviewRequest) async throws -> QLPreviewReply {
        let fileURL = request.fileURL

        // Find lex-cli binary - check app bundle first, then PATH
        let lexCLI = findLexCLI()

        // Generate PNG preview using lex-cli
        let pngData = try await generatePreview(for: fileURL, using: lexCLI)

        // Return the PNG as the preview
        let reply = QLPreviewReply(dataOfContentType: UTType.png, contentSize: CGSize(width: 680, height: 800)) { _ in
            return pngData
        }
        return reply
    }

    private func findLexCLI() -> URL {
        // Extension is at: LexEd.app/Contents/PlugIns/LexQuickLook.appex/Contents/MacOS/LexQuickLook
        // We need:         LexEd.app/Contents/Resources/lex-lsp
        // So from extension bundle, go up to Contents, then into Resources
        if let extensionBundle = Bundle.main.bundleURL.deletingLastPathComponent() // PlugIns/
            .deletingLastPathComponent() // Contents/
            .appendingPathComponent("Resources/lex-lsp") as URL? {
            if FileManager.default.fileExists(atPath: extensionBundle.path) {
                return extensionBundle
            }
        }

        // Fallback to common installation paths
        let candidates = [
            "/Applications/LexEd.app/Contents/Resources/lex-lsp",
            "/usr/local/bin/lex",
            "/opt/homebrew/bin/lex",
            NSHomeDirectory() + "/.cargo/bin/lex"
        ]

        for candidate in candidates {
            if FileManager.default.fileExists(atPath: candidate) {
                return URL(fileURLWithPath: candidate)
            }
        }

        // Default
        return URL(fileURLWithPath: "/Applications/LexEd.app/Contents/Resources/lex-lsp")
    }

    private func generatePreview(for fileURL: URL, using lexCLI: URL) async throws -> Data {
        let tempDir = FileManager.default.temporaryDirectory
        let outputPath = tempDir.appendingPathComponent("lex-quicklook-\(UUID().uuidString).png")

        let process = Process()
        process.executableURL = lexCLI
        process.arguments = [
            "convert",
            fileURL.path,
            "--to", "png",
            "-o", outputPath.path,
            "--extra-quicklook"
        ]

        // Suppress Chrome's stderr noise
        process.standardError = FileHandle.nullDevice
        process.standardOutput = FileHandle.nullDevice

        try process.run()
        process.waitUntilExit()

        guard process.terminationStatus == 0 else {
            throw PreviewError.conversionFailed
        }

        let data = try Data(contentsOf: outputPath)

        // Clean up
        try? FileManager.default.removeItem(at: outputPath)

        return data
    }
}

enum PreviewError: Error {
    case conversionFailed
    case fileNotFound
}
