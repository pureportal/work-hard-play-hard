# Building system

The floor layout stores structural geometry and detected rooms separately. Walls and openings are authored; rooms are derived after every structural edit.

## Geometry

- Wall endpoints are snapped to the 32 px building grid.
- Walls are horizontal or vertical centerlines rendered and collided at 12 px thickness.
- A wall may be one grid cell long. Perpendicular walls may cross or terminate on one another; collinear wall overlap is rejected.
- Doors and windows belong to one wall and use an offset along that wall.
- Doors remove their span from wall collision. Windows remain solid.

## Room detection

- Detection flood-fills the floor grid using walls as barriers.
- A room is a connected component of at least four cells that has no unblocked route to the outside of the floor.
- Doors and windows remain barriers during detection, so they close their wall opening without merging adjacent spaces.
- A missing wall section joins the cells on each side. If that connection reaches outdoors, the room disappears; otherwise the connected spaces become one room.
- Detected footprints never overlap. Room identity and configuration are reconciled to changed geometry by footprint overlap.

## Access

- Open rooms admit everyone.
- Assigned rooms admit any person listed in the room configuration or holding a temporary grant.
- A detected room is eligible for assigned access only when its boundary contains a door. Removing its final door immediately returns it to open access.
- Assigned rooms require at least one person. Knocking can be enabled independently for an assigned room.

## Windows and light

A window produces a floor-light source only when one side belongs to a detected room and the other can reach the floor edge. The source stores color, intensity, and depth independently from the rendered effect. Interior windows remain visible but do not produce outdoor light.
