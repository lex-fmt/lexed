Injection Highlighting Sample
-----------------------------

This fixture is used by `tests/e2e/injection-highlighting.spec.ts`. The
verbatim blocks below carry `:: <lang> ::` closing annotations — tree-sitter
detects the zones in the outer Lex document and Monaco's own Monarch
tokenizer for each language colours the zone content.

The `go` and `sql` blocks are deliberately outside the five languages the
retired embedded-grammar bundle shipped: they are the demonstration that
host-side resolution covers Monaco's whole language set.

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

Go example (outside the retired bundle):

    package main

    import "fmt"

    func main() {
        // count to three
        for i := 0; i < 3; i++ {
            fmt.Println("tick", i)
        }
    }

:: go ::

SQL example (outside the retired bundle):

    SELECT name, version
    FROM documents
    WHERE format = 'lex'
    ORDER BY name;

:: sql ::

Closing prose — none of these lines should be decorated by the
injection highlighter; only the verbatim content inside the blocks
above gets per-language tokenization.
