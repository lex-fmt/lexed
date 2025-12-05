import subprocess
import json
import sys
import time

def send_request(proc, method, params, id=None):
    content = {
        "jsonrpc": "2.0",
        "method": method,
        "params": params
    }
    if id is not None:
        content["id"] = id
    
    body = json.dumps(content)
    message = f"Content-Length: {len(body)}\r\n\r\n{body}"
    proc.stdin.write(message.encode('utf-8'))
    proc.stdin.flush()

def read_response(proc):
    headers = {}
    while True:
        line = proc.stdout.readline().decode('utf-8')
        if not line or line == '\r\n':
            break
        key, value = line.split(':', 1)
        headers[key.strip()] = value.strip()
    
    if 'Content-Length' not in headers:
        return None
        
    length = int(headers['Content-Length'])
    body = proc.stdout.read(length).decode('utf-8')
    return json.loads(body)

def main():
    # Path to the built LSP binary
    # It should be in target/debug/lex-lsp since we built it via npm run build -> cargo build
    lsp_path = "../../target/debug/lex-lsp"
    
    print(f"Starting LSP from {lsp_path}")
    proc = subprocess.Popen(
        [lsp_path],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=sys.stderr
    )

    # Initialize
    print("Sending initialize...")
    send_request(proc, "initialize", {
        "processId": None,
        "rootUri": None,
        "capabilities": {}
    }, id=1)

    # Read initialize response
    resp = read_response(proc)
    print("Initialize response:", resp)

    # Send initialized
    send_request(proc, "initialized", {})

    # Open a document with a typo
    print("Opening document...")
    send_request(proc, "textDocument/didOpen", {
        "textDocument": {
            "uri": "file:///test.lex",
            "languageId": "lex",
            "version": 1,
            "text": "Helllo World"
        }
    })

    # Wait for diagnostics
    print("Waiting for diagnostics...")
    start_time = time.time()
    while time.time() - start_time < 5:
        resp = read_response(proc)
        if resp and 'method' in resp and resp['method'] == 'textDocument/publishDiagnostics':
            print("Received diagnostics:", resp)
            diags = resp['params']['diagnostics']
            if len(diags) > 0:
                msg = diags[0]['message']
                if "Unknown word: Helllo" in msg:
                    print("SUCCESS: Found expected diagnostic!")
                    proc.terminate()
                    sys.exit(0)
                else:
                    print(f"FAILURE: Unexpected diagnostic message: {msg}")
                    proc.terminate()
                    sys.exit(1)
    
    print("FAILURE: Timed out waiting for diagnostics")
    proc.terminate()
    sys.exit(1)

if __name__ == "__main__":
    main()
