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

## ipTIME 공유기 설정

1. Home Assistant와 AdGuard Home 장치에 DHCP 고정 할당을 설정합니다. 예를 들어 Home Assistant는 `192.168.1.102`, AdGuard Home은 `192.168.1.105`를 사용할 수 있습니다.
2. DHCP 서버가 클라이언트에 안내하는 DNS 서버를 AdGuard Home의 고정 IP로 지정합니다. ipTIME 펌웨어에 따라 이 항목은 DHCP 서버 설정이나 인터넷 DNS 설정에 있을 수 있습니다.
3. 가전, Home Assistant, AdGuard Home이 서로 통신할 수 있도록 같은 LAN을 사용하고 게스트 네트워크 또는 AP 격리 기능을 사용하지 않습니다.
4. 인터넷 포트 포워딩은 필요하지 않습니다. 필수 포트는 로컬 네트워크에서만 접근 가능하게 유지합니다.

## AdGuard Home 설정

1. AdGuard Home에서 **필터 → DNS 재작성**을 엽니다.
2. 도메인에 `rethink.home.arpa`, 응답에 Home Assistant의 고정 IP를 입력하고 활성화합니다.
3. `common.lgthinq.com`은 추가하지 않거나 기존 재작성이 있다면 제거합니다. Rethink 애드온의 `hostname`과 동일한 이름만 재작성해야 합니다.
4. AdGuard Home의 DNS 캐시를 비웁니다.
5. `nslookup rethink.home.arpa <AdGuard_IP>` 명령으로 Home Assistant IP가 반환되는지 확인합니다. 예: `nslookup rethink.home.arpa 192.168.1.105`.
6. 가전이 이전 DNS 결과를 보관하고 있다면 Wi-Fi를 다시 연결합니다. 계속 연결되지 않으면 가전의 네트워크 설정을 초기화한 뒤 ThinQ 등록 절차를 다시 진행합니다.

AdGuard Home을 우회하는 보조 DNS가 공유기나 단말에 설정되어 있으면 가전이 재작성 결과를 사용하지 않을 수 있습니다. 가전에 배포되는 DNS 서버가 AdGuard Home인지 확인하십시오.

관리 화면은 애드온 페이지의 **웹 UI 열기**에서 이용할 수 있습니다.

가전 연결 포트나 관리 포트를 인터넷에 직접 공개하지 마십시오.
