# LG 2RES2VE300UA2 Protocol Notes

## Scope

This document records direct packet captures and implementation findings for the Korean LG refrigerator model `2RES2VE300UA2`.

Evidence labels used below:

- **Confirmed**: reproduced by a direct command/status round trip.
- **Strong candidate**: matches the shared refrigerator layout and observed behavior, but lacks an isolated transition.
- **Unconfirmed**: retained as a raw value or hypothesis only.

Do not transfer enum values or command lengths from another refrigerator model without a capture from this appliance.

## AABB envelope

Packets use the following envelope:

```text
AA length inner-payload checksum BB
```

The checksum is calculated by summing the packet with the checksum and final marker initially set to zero, taking the low byte, then XORing it with `0x55`.

## Primary packet flow

| Identifier | Direction           | Meaning                                 | Evidence                                        |
| ---------- | ------------------- | --------------------------------------- | ----------------------------------------------- |
| `F0ED`     | Server to appliance | Full status query                       | Confirmed                                       |
| `10EB`     | Appliance to server | Initial/full status, one 68-byte record | Confirmed                                       |
| `10EC`     | Appliance to server | Previous and current 68-byte records    | Confirmed                                       |
| `F017`     | Server to appliance | Masked setting update                   | Confirmed for documented offsets                |
| `1000`     | Appliance to server | Command receipt/result ACK              | Confirmed; not proof of state transition        |
| `F010`     | Server to appliance | Night-glare schedule and brightness     | Confirmed                                       |
| `10AF`     | Appliance to server | Energy-related report                   | Strong candidate; exact unit/window unconfirmed |
| `1018`     | Appliance to server | Short repeated service/keepalive packet | Unconfirmed                                     |
| `1072`     | Appliance to server | Heartbeat/keepalive family              | Strong candidate                                |

Full status query:

```text
AA0EF0ED1211010000010400EBBB
```

## Status records

`10EB` carries one 68-byte status record. `10EC` carries the previous record followed by the current record; always use the second record as current state.

### Shared and verified offsets

| Offset | Shared field                                   | Observed values and interpretation                                                     | Evidence                                   |
| -----: | ---------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------ |
|      0 | `monStatus`                                    | Usually `2`; detailed meaning unknown                                                  | Strong candidate name only                 |
|      1 | Fridge setpoint                                | Celsius = `8 - raw`                                                                    | Confirmed                                  |
|      2 | Freezer setpoint                               | Celsius = `-14 - raw`                                                                  | Confirmed                                  |
|      3 | Express freeze                                 | `1=OFF`, `2=ON`                                                                        | Confirmed                                  |
|      4 | Fresh-air/Pure N Fresh                         | `2=Automatic`, `7=Smart Care/diagnostic`; shared-model `1=Off`, `3=Power`, `4=Replace` | Mixed; only 2 and 7 directly observed here |
|      5 | Smart saving                                   | `0` observed                                                                           | Strong candidate name only                 |
|      6 | Water filter                                   | `0` observed; support and unit unknown                                                 | Strong candidate name only                 |
|      7 | Any door open                                  | `0=closed`, `1=open`                                                                   | Confirmed                                  |
|      8 | Temperature unit                               | `1=Celsius`                                                                            | Strong candidate                           |
|      9 | Smart-saving run                               | `0` observed                                                                           | Strong candidate name only                 |
|     10 | Display lock                                   | `1` observed; polarity not yet tested                                                  | Strong candidate name, raw sensor only     |
|     11 | Active saving                                  | `FF`                                                                                   | Unsupported/not available candidate        |
|     12 | Eco friendly                                   | `FF`                                                                                   | Unsupported/not available candidate        |
|     13 | Convertible temperature                        | `FF`                                                                                   | Unsupported/not available candidate        |
|     14 | Sabbath mode                                   | `0` observed                                                                           | Strong candidate name only                 |
|     15 | Dual fridge                                    | `FF`                                                                                   | Unsupported/not available candidate        |
|     16 | Express cool                                   | `0=OFF`, `1=ON`                                                                        | Confirmed                                  |
|     17 | Smart Care+                                    | `0=OFF`, `1=ON`                                                                        | Confirmed                                  |
|  18-24 | Drawer/pantry/voice/dispenser/self-care family | Mostly `FF`                                                                            | Shared names; unsupported candidates       |
|     25 | Craft Ice                                      | `2` observed; meaning/support unknown                                                  | Strong candidate name only                 |
|     26 | Monitor data number                            | Incrementing values observed, including `8`, `13`, `14`, `15`                          | Strong candidate sequence/revision field   |

### Model-specific extension candidates

| Offset | Observed values    | Current hypothesis                                                                                                   | Evidence                                                                   |
| -----: | ------------------ | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
|     27 | `1`                | Fridge temperature-maintenance result candidate                                                                      | Unconfirmed                                                                |
|     28 | `3 -> 1` overnight | Freezer temperature-maintenance result candidate; possibly `3=above target/cooling`, `1=maintained`                  | Strong candidate, but freezer setpoint also changed during the observation |
|     30 | `0`, `2`, `3`      | Night-glare mode: disabled/unknown, sunrise-sunset, user schedule                                                    | Confirmed for 2 and 3; disabled uses other values                          |
|     32 | `1`                | Unknown binary/enum                                                                                                  | Unconfirmed                                                                |
|     40 | `1`                | Unknown binary/enum                                                                                                  | Unconfirmed                                                                |
|     64 | `120`              | Unknown fixed/model/diagnostic value; not responsive to setpoint, Express Freeze, Smart Care, or night-glare changes | Confirmed raw value, meaning unconfirmed                                   |

`FF` in a full `10EB`/`10EC` status record usually indicates unsupported or unavailable data. In an `F017` command, `FF` instead means “leave unchanged.” Zero can be a valid OFF/default value and must not automatically be treated as unsupported.

## F017 setting commands

The appliance uses a 118-byte live-captured command body beginning with `F017`. For verified shared fields, the command byte is located at:

```text
command[2 + statusOffset] = value
```

Verified settings:

| Status offset | Setting          |             OFF/value | ON/value |
| ------------: | ---------------- | --------------------: | -------: |
|             1 | Fridge setpoint  |   raw = `8 - Celsius` |        — |
|             2 | Freezer setpoint | raw = `-14 - Celsius` |        — |
|             3 | Express freeze   |                   `1` |      `2` |
|            16 | Express cool     |                   `0` |      `1` |
|            17 | Smart Care+      |                   `0` |      `1` |

Smart Care+ ON:

```text
AA7CF017FF0000FFFFFFFFFFFFFFFFFFFF00FFFFFF01FFFFFF000000FFFF00FFFFFFFF00FFFFFFFFFFFFFFFFFF00FFFFFF1EFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF0AFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF00FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFB8BB
```

Smart Care+ OFF:

```text
AA7CF017FF0000FFFFFFFFFFFFFFFFFFFF00FFFFFF00FFFFFF000000FFFF00FFFFFFFF00FFFFFFFFFFFFFFFFFF00FFFFFF1EFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF0AFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF00FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFB9BB
```

Common ACK:

```text
AA08100017008CBB
```

The ACK confirms receipt/processing only. Smart Care+ OFF was previously acknowledged without a state transition while the appliance was busy. Use `10EB/10EC status[17]` as the authoritative state.

## F010 night-glare settings

Current payload layout:

```text
F0 10
02
mode
YY MM DD HH MM SS   start, UTC
YY MM DD HH MM SS   end, UTC
00                  reserved
brightness          integer percent encoded directly as one byte
```

Modes:

```text
01 = sunrise/sunset schedule
02 = user schedule
```

Observed supported brightness values:

```text
0, 10, 30, 50, 80, 100
```

User schedule example, 21:00-06:00 KST and 30% brightness:

```text
AA16F01002021A080E0C00001A080E150000001E36BB
```

Times must be encoded in UTC. The end date can remain the same UTC calendar date while representing the next local day after conversion.

Sunrise/sunset example at 30%:

```text
AA16F01002011A080E0A2F111A080E142F00001E9BBB
```

ACK:

```text
AA081000100087BB
```

The 68-byte status record exposes the mode at offset 30, but no verified offset exposes the configured brightness.

## Energy-related reports

Observed examples:

```text
AA0910AF0F001DCBBB   subtype 0F, value 29
AA0910AF0F0021F7BB   subtype 0F, value 33
AA0910AF10005A89BB   subtype 10, value 90
```

The last two payload bytes are decoded as an unsigned big-endian number. Identical reports can be retransmitted several times within seconds.

Unresolved questions:

- Whether the number is Wh, a current-period counter, or another energy unit.
- Whether subtype `0F`/`10` identifies a period, report kind, or sequence.
- The actual reporting/reset boundary.
- Whether a reliable power value in watts can be derived.

The current Home Assistant implementation uses a 15-minute compatibility window only to suppress rapid duplicate accumulation. **This is an implementation assumption, not a confirmed appliance update interval.** The hour/day/month/lifetime values are software-maintained totals, not proven appliance-native totals.

## Software-derived Home Assistant values

The following values are calculated locally rather than read as native lifetime counters:

- Door-open count today.
- Door-open duration today.
- Current-hour, today, month, and lifetime accumulated energy.

Deleting the persistent add-on data resets software-maintained lifetime baselines.

## Next verification targets

1. Capture `10EB` while the LG app shows separate fridge/freezer messages for “temperature maintained” and “above target.”
2. Confirm whether offsets 27 and 28 change independently with those two app messages.
3. Toggle the physical display lock and capture the resulting `10EC` to establish offset 10 polarity.
4. Capture Pure N Fresh Off/Automatic/Power transitions on this exact model.
5. Record distinct `10AF` values and timestamps across several hours and across an hour boundary.
6. Capture all traffic during a safe refrigerator restart and recovery to target temperature.
