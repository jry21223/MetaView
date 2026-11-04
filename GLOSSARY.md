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

## Interactive Works

**Playbook document**: An editable work assembled from scenes, component instances, parameters and knowledge objects. A revision identifies one immutable edition.

**Canvas element**: A selectable authored part of a work, including a shape, label, axis, image or group, whether or not it expresses a knowledge object.

**Semantic object**: A knowledge entity or relationship expressed by one or more canvas elements. One element may express several semantic objects.

**Context snapshot**: The captured state of a particular work revision at a point in a visit, including parameters, component state, view and selected elements.

**Exploration**: Creating an independently runnable work from a question about an existing work and its captured context.

**Visit**: Viewing a work at a particular state. Returning to a visit does not change the work's revision history.

**Publication**: An explicitly selected, immutable edition of a work made available to readers. Saving a draft does not change a publication.
