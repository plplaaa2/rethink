# Rethink Home Assistant Add-on

LG ThinQ 가전을 로컬 Rethink 서버에 연결하고 MQTT Discovery를 통해 Home Assistant 기기로 등록합니다.

## 설정

- `hostname`: Home Assistant 호스트를 가리키는 로컬 DNS 이름입니다. 기본값은 `rethink.home.arpa`입니다.
- `mqtt_auto_discovery`: Home Assistant Supervisor가 제공하는 MQTT 연결 정보를 사용합니다. 기본적으로 활성화됩니다.
- `mqtt_server`: 자동 검색 실패 시 사용할 수동 MQTT URL입니다. 프로토콜과 포트를 포함해야 합니다(예: `mqtt://192.168.1.10:1883`).
- `mqtt_username`: 수동 MQTT 사용자 ID입니다.
- `mqtt_password`: 수동 MQTT 비밀번호입니다.
- `discovery_prefix`: Home Assistant MQTT Discovery 토픽 접두사입니다.
- `rethink_prefix`: Rethink가 사용하는 MQTT 토픽 접두사입니다.

자동 검색이 활성화되어 있고 MQTT 서비스를 사용할 수 있으면 Supervisor에서 검색한 연결 정보를 우선 사용합니다. 검색에 실패하면 수동 MQTT 옵션으로 전환합니다. 항상 수동 값을 사용하려면 자동 검색을 비활성화하십시오.

## 네트워크 요구 사항

가전에서 설정한 호스트 이름(기본값 `rethink.home.arpa`)이 Home Assistant 호스트로 확인되도록 로컬 DNS 서버나 공유기를 설정해야 합니다. 가전에서 Home Assistant 호스트의 `443`, `8883`, `46030`, `47878` 포트에 접근할 수 있어야 합니다.

Rethink 애드온은 MQTT Broker 애드온과의 충돌을 피하기 위해 내부 비암호화 MQTT 포트 `1884`를 Home Assistant 호스트에 공개하지 않습니다. ThinQ 2 연결에는 `8883`이 반드시 필요하므로 MQTT Broker 애드온이 호스트 포트 `8883`을 공개 중이라면 Broker 애드온 쪽의 해당 포트 설정을 제거한 뒤 Rethink를 시작해야 합니다. 일반적인 Broker 연결 포트 `1883` 설정에는 영향이 없습니다.

관리 화면은 애드온 페이지의 **웹 UI 열기**에서 이용할 수 있습니다.

가전 연결 포트나 관리 포트를 인터넷에 직접 공개하지 마십시오.
