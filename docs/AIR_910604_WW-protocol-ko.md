# AIR_910604_WW ThinQ 1 프로토콜

AS121VRST 공기청정기에서 직접 캡처하고 실제 동작을 확인한 항목만 기록한다.

## 기기 정보

- 모델 ID: `AIR_910604_WW`
- 플랫폼: ThinQ 1
- 관찰 펌웨어: `2.6.7_RTOS_3K`
- 그룹 유형: `12`

## 확인된 제어

| 기능      | CmdOpt      | Value                                             |
| --------- | ----------- | ------------------------------------------------- | --- | --- | --- | ------- |
| 전원 켜기 | `Operation` | `"1"`                                             |
| 전원 끄기 | `Operation` | `"0"`                                             |
| 쾌속 모드 | `Set`       | `{ "AirFast": "1" }` / `{ "AirFast": "0" }`       |
| 공기 제균 | `Set`       | `{ "AirRemoval": "1" }` / `{ "AirRemoval": "0" }` |
| 취침 예약 | `Set`       | `{ "SleepTime": "0                                | 120 | 240 | 480 | 720" }` |

취침 예약 값의 단위는 분이며 각각 끔, 2시간, 4시간, 8시간, 12시간이다. 응답의
`ReturnCode: "0000"`은 명령 수신 성공만 의미하며 실제 상태 보고로 간주하지 않는다.

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

풍속, 미세먼지, 현재 운전 상태, 예약 상태 조회는 아직 패킷 키와 값이 확인되지 않아 노출하지 않는다.
