Injection Highlighting Sample
-----------------------------

This fixture is used by `tests/e2e/injection-highlighting.spec.ts`. The
two verbatim blocks below carry `:: python ::` and `:: javascript ::`
closing annotations — the injection highlighter should detect them via
tree-sitter and apply categorised decorations over each block's content.

Python example:

    def greet(name):
        return "hello " + name

    class Greeter:
        def __init__(self, prefix):
            self.prefix = prefix

:: python ::

Some plain prose between the blocks. This line must *not* be decorated
by the injection highlighter — only the verbatim content should be.

JavaScript example:

    const x = 42;
    function add(a, b) {
        return a + b;
    }
    // a trailing comment

:: javascript ::

Closing prose — again, no injection decorations here.
