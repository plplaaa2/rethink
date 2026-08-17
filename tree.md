# Project Tree

```text
.
|-- .github/workflows/       # CI and container publishing
|-- bridge/                  # Optional LG cloud bridge
|-- cloud/                   # ThinQ endpoints and MQTT discovery
|   |-- devices/2RES2VE300UA2.ts # LG Korean refrigerator protocol handler
|   `-- devices/AIR_910604_WW.ts # LG AS121VRST air purifier protocol handler
|-- docs/                    # Reverse-engineering investigation notes
|   |-- 2RES2VE300UA2-protocol-en.md # English refrigerator protocol captures and field map
|   |-- 2RES2VE300UA2-protocol-ko.md # Korean refrigerator protocol captures and field map
|   |-- AIR_910604_WW-protocol-ko.md # Korean AS121VRST confirmed controls and filter query
|   |-- AS121VRST-registration-ko.md # Korean AS121VRST Wi-Fi, DNS, and bridge registration guide
|   |-- RAC_056905_WW-protocol.md # RAC TLV protocol, controls, sensors, and safety notes
|   `-- rac-tlv-sensor-investigation.md # RAC TLV sensor observations
|-- html/                    # Management interface assets
|   `-- i18n.js              # Browser-language management UI translations
|-- management/              # Management web server
|-- rethink-addon/           # Home Assistant add-on wrapper
|   |-- translations/        # Add-on UI translations
|   |-- config.yaml          # Add-on manifest and options
|   |-- Dockerfile           # Add-on container wrapper
|   |-- run.sh               # Runtime configuration generator
|   |-- README.md            # Store summary
|   |-- DOCS.md              # User documentation
|   `-- CHANGELOG.md         # Add-on release notes
|-- tests/                   # Automated tests
|   |-- cloud/devices/2RES2VE300UA2.test.ts # Refrigerator protocol regression tests
|   `-- cloud/devices/AIR_910604_WW.test.ts # AS121VRST control and filter regression tests
|-- tools/                   # Reverse-engineering utilities
|-- util/                    # Shared TypeScript utilities
|-- CHANGELOG.md             # Root add-on release notes
|-- Dockerfile               # Upstream application image
|-- repository.yaml          # Home Assistant repository metadata
`-- rethink-cloud.ts         # Main service entry point
```
