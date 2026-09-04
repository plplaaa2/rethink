# AIR_910604_WW ThinQ 1 프로토콜

AS121VRST 공기청정기에서 직접 캡처하고 실제 동작을 확인한 항목만 기록한다.

## 기기 정보

- 모델 ID: `AIR_910604_WW`
- 플랫폼: ThinQ 1
- 관찰 펌웨어: `2.6.7_RTOS_3K`
- 그룹 유형: `12`

## 확인된 제어

| 기능      | CmdOpt      | Value                                             |
| --------- | ----------- | ------------------------------------------------- |
| 전원 켜기 | `Operation` | `"1"`                                             |
| 전원 끄기 | `Operation` | `"0"`                                             |
| 쾌속 모드 | `Set`       | `{ "AirFast": "1" }` / `{ "AirFast": "0" }`       |
| 공기 제균 | `Set`       | `{ "AirRemoval": "1" }` / `{ "AirRemoval": "0" }` |
| 취침 예약 | `Set`       | `SleepTime`: `0`, `120`, `240`, `480`, `720`      |
| 풍속      | `Set`       | `WindStrength`: `2`, `4`, `6`, `8`                |

취침 예약 값의 단위는 분이며 각각 끔, 2시간, 4시간, 8시간, 12시간이다. 응답의
`ReturnCode: "0000"`은 명령 수신 성공만 의미하며 실제 상태 보고로 간주하지 않는다.

풍속 값은 본체에서 각 단계를 선택해 상태를 비교하고 중풍 제어를 실제 시험하여 확인했다.

| 풍속 | 값  |
| ---- | --- |
| 약   | `2` |
| 중   | `4` |
| 강   | `6` |
| 자동 | `8` |

## 상태 모니터링

다음 명령은 현재 연결에서 상태 모니터링 구독을 시작한다.

```json
{ "Cmd": "Mon", "CmdOpt": "Start" }
```

구독 후 기기는 약 3초 안에 첫 전체 상태 JSON을 보내고 이후 약 3초마다 반복한다. Rethink는 트래픽과
로그를 줄이기 위해 첫 유효 상태를 받으면 `Mon/Stop`을 보낸다. 마지막 전원이 켜짐이면 60초, 꺼짐이면
5분마다 같은 단발 스냅샷을 반복한다. Home Assistant 제어 시에는 명령값을 UI에 즉시 반영하고, 기기에서
Data 없는 `ReturnCode: "0000"`을 받으면 바로 스냅샷을 시작해 실제 상태로 보정한다. ACK가 없을 때는
2초 뒤 조회하는 fallback을 사용한다.

본체 버튼 조작도 Data 없는 성공 응답을 자발적으로 전송하므로 전원 꺼짐 상태의 5분 주기를 기다리지
않고 즉시 상태를 갱신할 수 있다. 모니터·필터의 Data 포함 성공 응답은 새 조회를 유발하지 않는다.
확인된 상태 필드는 다음과 같다.

Home Assistant에서는 `Operation` 전원과 `WindStrength` 네 단계를 하나의 Fan 엔티티로 제공하며,
풍속은 Low, Medium, High, Auto 프리셋으로 선택한다.

| 필드           | 의미                                                        |
| -------------- | ----------------------------------------------------------- |
| `Operation`    | 전원: `0` 끔, `1` 켬                                        |
| `WindStrength` | 풍속: `2`, `4`, `6`, `8`                                    |
| `SleepTime`    | 취침 예약 분                                                |
| `AirFast`      | 쾌속 모드: `0` 끔, `1` 켬                                   |
| `AirRemoval`   | 공기 제균: `0` 끔, `1` 켬                                   |
| `SensorPM1`    | PM1.0, `µg/m³`                                              |
| `SensorPM2`    | PM2.5, `µg/m³`                                              |
| `SensorPM10`   | PM10, `µg/m³`                                               |
| `AirPolution`  | TVOC/냄새 등급: `0` Good, `1` Normal, `2` Bad, `3` Very Bad |
| `SensorMon`    | 센서 측정 방식: `0` Only while operating, `1` Always        |

같은 상태 패킷에는 여러 LG 제품군이 공유하는 미지원 필드도 다수 포함된다. 값이 `NS` 또는 고정된 `0`인
온도·온수·가습·풍향 필드는 AS121VRST에서 검증되지 않았으므로 Home Assistant에 노출하지 않는다.

`AirPolution`은 앱의 냄새 4단계 표시와 대조하여 TVOC 등급으로 기록한다. Rethink에서는 이를
`TVOC` 센서로 노출하고 위 등급명을 상태 텍스트로 사용한다. `SensorMon`은 다음과 같이 설정한다.

```json
{ "Cmd": "Config", "CmdOpt": "Set", "Value": "SensorMon", "Data": "eyJTZW5zb3JNb24iOiIxIn0=" }
```

위 패킷의 Data는 `{ "SensorMon": "1" }`의 Base64 표현이며 `"0"`은 운전 중에만,
`"1"`은 항상 측정을 의미한다.

## 필터 조회

```json
{ "Cmd": "Config", "CmdOpt": "Get", "Value": "MFilter", "Data": "bnVsbA==" }
```

관찰된 응답 데이터는 UTF-8 JSON이다.

```json
{ "RemainTime": "2843", "ChangePeriod": "4000" }
```

- `RemainTime`: 필터 잔여 시간
- `ChangePeriod`: 필터 교체 주기
- 잔여율: `RemainTime / ChangePeriod * 100`

## 미확인 항목

다음 필드는 상태 JSON에서 발견했지만 의미나 값의 동작을 충분히 검증하지 못했으므로 아직 노출하지
않는다.

| 필드                            | 현재 판단                                                                            |
| ------------------------------- | ------------------------------------------------------------------------------------ |
| `AirMonitoring`                 | 에어 모니터링 기능 상태 또는 지원 여부 후보. `SensorMon`과 별도 필드이며 의미 미확정 |
| `TotalAirPolution`              | 종합 공기질/오염도 후보. `AirPolution`과의 관계 미확정                               |
| `DisplayControl`                | 디스플레이 표시 설정 후보. 앱에 조작 기능이 없어 값 의미 미확정                      |
| `SignalLighting`                | 상태·공기질 표시등 설정 후보. 값 의미 미확정                                         |
| `WatertankLight`                | 물탱크 조명 설정 후보. 값 의미 미확정                                                |
| `SensorHumidity`, `HumidityCfg` | 습도 측정값·설정 후보. 현재 값과 단위 검증 부족                                      |
| `OpMode`, `DiagCode`            | 운전 모드·진단 코드 후보. 세부 의미 미확정                                           |

일반 모니터링 상태에는 팬 RPM이 포함되지 않는다. 앱에 없는 필드는 실제 기기 반응과 추가 캡처로
검증하기 전까지 구현하지 않는다.
