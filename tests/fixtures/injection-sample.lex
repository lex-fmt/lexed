Injection Highlighting Sample
-----------------------------

This fixture is used by `tests/e2e/injection-highlighting.spec.ts`. The
verbatim blocks below carry `:: <lang> ::` closing annotations — the
injection highlighter detects them via tree-sitter and runs each
bundled grammar's `highlights.scm` over the zone content.

Python example:

    def greet(name):
        return "hello " + name

    class Greeter:
        def __init__(self, prefix):
            self.prefix = prefix

:: python ::

JavaScript example:

    const x = 42;
    function add(a, b) {
        return a + b;
    }
    // a trailing comment

:: javascript ::

JSON example:

    {
        "name": "lex",
        "version": "1.0.0",
        "tags": ["editor", "syntax"]
    }

:: json ::

Rust example:

    use std::collections::HashMap;

    fn main() {
        let mut map: HashMap<String, i32> = HashMap::new();
        map.insert("hello".to_string(), 42);
    }

:: rust ::

Bash example:

    #!/usr/bin/env bash
    set -euo pipefail

    for f in *.lex; do
        echo "Processing $f"
    done

:: bash ::

Closing prose — none of these lines should be decorated by the
injection highlighter; only the verbatim content inside the blocks
above gets per-language tokenization.
