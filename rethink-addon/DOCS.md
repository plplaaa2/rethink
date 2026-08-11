# Rethink Home Assistant Add-on

## Configuration

- `hostname`: Local DNS name redirected to the Home Assistant host. The default is `rethink.home.arpa`.
- `mqtt_auto_discovery`: Use MQTT connection information provided by Home Assistant Supervisor. Enabled by default.
- `mqtt_server`: Manual fallback MQTT URL, including the scheme and port (for example, `mqtt://192.168.1.10:1883`).
- `mqtt_username`: Manual fallback MQTT user ID.
- `mqtt_password`: Manual fallback MQTT password.
- `discovery_prefix`: Home Assistant MQTT discovery prefix.
- `rethink_prefix`: MQTT topic prefix used by Rethink.

When automatic discovery is enabled and an MQTT service is available, the discovered values take precedence. If discovery fails, Rethink uses the manual MQTT options. Disable automatic discovery to always use the manual values.

## Network requirement

The appliance must resolve the configured hostname (default: `rethink.home.arpa`) to the Home Assistant host. Configure the local DNS server or router accordingly. Ports 443, 8883, 46030, and 47878 must be reachable by the appliance.

The add-on does not publish its internal unencrypted MQTT port `1884` to the Home Assistant host because it can conflict with an installed MQTT broker add-on. Port `8883` is required for ThinQ 2 appliances, so if an MQTT broker add-on publishes host port `8883`, remove that port mapping from the broker add-on before starting Rethink. This does not affect Rethink's broker connection configured by `mqtt_server`, which normally uses port `1883`.

The management interface is available from the add-on page through **Open Web UI**.

Do not publish the appliance or management ports to the internet.
