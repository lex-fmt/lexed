Spelchek Fixture Document
A subtitle that contians a recieve typo

Sectoin: Prose tests

	A paragraph that occured here and is full of behaviuor differences.

	- A list item with the Mispelled term inside it
	- Another item, no typo

	Mispelled term:
		A definition body that contians prose.

	Brokn table caption:
		| Coloumn A | Coloumn B |
		| --------- | --------- |
		| cell with occured | other cell |

Sectoin: Verbatim and annotation tests

	Pythn code example:
		def teh_function():
			# this comment has occured but should NOT flag
			recieve = 1
			return recieve
	:: code ::

	:: note :: trailing descriptor with teh typo
	:: note nott_a_typo_label param=ignoreMe ::
	:: data src=somepath/ignoreMe.lex ::

	:: note ::
		The body of this annotation contians teh prose,
		and should be spell-checked like any paragraph.
	::

	Inline atoms:
		A paragraph with `teh code span` and #teh math# that should be ignored,
		plus a [reference] that is also ignored.
