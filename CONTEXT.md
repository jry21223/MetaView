# MetaView Visual Explanation Context

This context names the semantic concepts used to turn an explanation into an inspectable visual sequence.

## Algorithm Visualization

**Primary relation**:
The relationship a visual must make easiest to compare, such as position, magnitude, order, membership, range, swap, or pointer movement.
_Avoid_: Data shape, numeric appearance

**Sequence**:
An ordered collection whose stable positions and element membership are part of the explanation.
_Avoid_: Array, list

**Range**:
An inclusive, contiguous interval within a sequence that carries a teaching role such as a window, search space, or partition.
_Avoid_: Highlighted items

**Auxiliary lane**:
A secondary sequence shown alongside the primary sequence, such as a deque or accumulated result.
_Avoid_: Extra row, annotation
