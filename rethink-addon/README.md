# Rethink Home Assistant Add-on

LG ThinQ 가전을 로컬 Rethink 서버에 연결하고 MQTT Discovery를 통해 Home Assistant 기기로 등록합니다.

## 주요 기능

- Supervisor MQTT 서비스 자동 검색
- MQTT 서버, 사용자 ID, 비밀번호 수동 폴백
- Home Assistant ingress 관리 화면
- 인증서와 브리지 상태 영구 보관
- ThinQ 1 및 ThinQ 2 기기 지원

가전을 연결하기 전에 `rethink.home.arpa` 또는 사용자가 지정한 호스트 이름이 Home Assistant 호스트를 가리키도록 로컬 DNS를 설정해야 합니다.

Rethink 애드온은 MQTT Broker 애드온과의 충돌을 피하기 위해 내부 비암호화 MQTT 포트 `1884`를 Home Assistant 호스트에 공개하지 않습니다. ThinQ 2 연결에는 `8883`이 반드시 필요하므로 MQTT Broker 애드온이 호스트 포트 `8883`을 공개 중이라면 Broker 애드온 쪽의 해당 포트 설정을 제거한 뒤 Rethink를 시작해야 합니다. 일반적인 Broker 연결 포트 `1883` 설정에는 영향이 없습니다.

설정 옵션과 필수 포트는 [전체 사용 설명서](DOCS.md)를 참고하십시오.
