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

ipTIME에서는 Home Assistant에 고정 IP를 할당하고 DHCP 클라이언트가 AdGuard Home이 설치된 호스트를 DNS 서버로 사용하도록 설정합니다. AdGuard Home 애드온이면 DNS 서버 주소는 Home Assistant IP이며, 독립 설치형일 때만 별도 호스트 IP를 사용합니다. AdGuard Home에는 `rethink.home.arpa`만 Home Assistant IP로 연결하는 DNS 재작성을 추가하고 `common.lgthinq.com`은 재작성하지 마십시오. 캐시를 비운 뒤 가전의 Wi-Fi를 다시 연결하거나 네트워크 설정을 초기화해 재등록합니다.

설정 옵션과 필수 포트는 [전체 사용 설명서](DOCS.md)를 참고하십시오.
