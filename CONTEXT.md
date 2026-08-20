# Joystick Camera Control

This context describes the operator-facing language for staging, controlling, and switching RoomOS camera sources with a Thrustmaster T.16000M joystick.

## Language

**Main**:
The camera source currently live to the room audience.
_Avoid_: Program, active feed

**Preview**:
The camera source staged on the secondary display before it is taken live.
_Avoid_: Auxiliary feed, standby feed

**Preview Display**:
The local screen used to view and frame the staged Preview source before sending it to Main. Its configured mode enables or disables all Preview behavior, and its output identifies the target video matrix output.

**Controlled Camera**:
The camera whose pan, tilt, and zoom respond to joystick movement; it is associated with either Main or Preview.
_Avoid_: Selected camera, active camera

**Camera Source**:
A selectable RoomOS video input that may be associated with a camera control target. Its ConnectorId is unique within the configuration, while multiple Camera Sources may share the same ControlId.
_Avoid_: Physical camera

**Discovered Camera Source**:
A camera-capable video input reported by a device through a Verified Device Connection and offered for addition to the configuration.
_Avoid_: Discovered physical camera

**Video-only Camera Source**:
A Camera Source without a camera control target. It can be routed to Main or Preview but cannot respond to joystick pan, tilt, or zoom movement.
_Avoid_: Disconnected camera, uncontrolled camera

**Swap**:
An exchange of the Main and Preview camera sources without changing which physical camera is currently controlled. The Control Method changes to the controlled camera's new role: Preview becomes Live, or Live becomes Preview.
_Avoid_: Cut, take

**Precision Mode**:
A temporary slower camera-movement mode used for fine positioning while its assigned button is held.
_Avoid_: Slow mode

**Button Action**:
A named operator function assigned to a logical joystick button. Built-in actions and generated camera-selection actions share this vocabulary.
_Avoid_: Map ID, mapped ID

**Camera Button Action**:
A generated, readable action such as `SelectCamera1` that connects one camera definition to exactly one button without coupling the camera to a fixed physical position.
_Avoid_: Camera map ID, camera index, camera button ID

**No Action**:
An intentionally blank control value (`''`, `null`, or `undefined`) for a listed logical button ID. The browser configurator generates `''`.
_Avoid_: Unassigned action

**Guide Button**:
The stable physical button number printed on the operator guide.
_Avoid_: Logical button ID

**Logical Button ID**:
The readable, handedness-dependent Thrustmaster class identifier, such as `STICK_TRIGGER` or `BASE_LEFT_1`, used as a public `config.controls` key.
_Avoid_: Configuration button number

**Verified Device Connection**:
An installer connection to the intended RoomOS device whose identity has been confirmed before device configuration or status is read or changed.
_Avoid_: Device socket, socket connection

## Development and deployment

**RoomOS validation target**: `parent-2-prog2`

Use the exact `parent-2-prog2` alias through the shared RoomOS Socket Workbench
for this project's device validation and deployment. Do not create a parallel
device connection or substitute another target.

The repository owner has authorized completed, locally validated work to be
committed and pushed before installing it on `parent-2-prog2`. Preview every
device-side macro change before applying it. Installing or deploying the macro
requires a RoomOS macro runtime restart, which restarts every active macro on
that device.
