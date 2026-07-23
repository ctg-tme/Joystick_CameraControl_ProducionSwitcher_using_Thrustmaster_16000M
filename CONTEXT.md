# Joystick Camera Control

This context describes the operator-facing language for staging, controlling, and switching RoomOS camera sources with a Thrustmaster T.16000M joystick.

## Language

**Main**:
The camera source currently live to the room audience.
_Avoid_: Program, active feed

**Preview**:
The camera source staged on the secondary display before it is taken live.
_Avoid_: Auxiliary feed, standby feed

**Controlled Camera**:
The camera whose pan, tilt, and zoom respond to joystick movement; it is associated with either Main or Preview.
_Avoid_: Selected camera, active camera

**Swap**:
An exchange of the Main and Preview camera sources without changing which physical camera is currently controlled.
_Avoid_: Cut, take

**Precision Mode**:
A temporary slower camera-movement mode used for fine positioning while its assigned button is held.
_Avoid_: Slow mode

**Button Action**:
A named operator function assigned to a logical joystick button. Built-in actions and generated camera-selection actions share this vocabulary.
_Avoid_: Map ID, mapped ID

**Camera Button Action**:
A generated, readable action such as `SelectQuadCamera` that connects one camera definition to exactly one button without coupling the camera to a fixed physical position.
_Avoid_: Camera map ID, camera index, camera button ID

**Unassigned**:
The explicit no-op Button Action used when a listed button should perform no function.
_Avoid_: Missing, blank

**Guide Button**:
The stable physical button number printed on the operator guide.
_Avoid_: Logical button ID

**Logical Button ID**:
The Thrustmaster class identifier used as a key in `config.controls`. Base-button identifiers depend on the physical handedness switch.
_Avoid_: Guide button
