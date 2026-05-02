#!/usr/bin/env bash
set -euo pipefail

cd /home/xcat2008/casalume

echo "== CasaLume DEV deploy seguro =="

mkdir -p /home/xcat2008/backups

sudo tar \
  --exclude='/home/xcat2008/casalume/infra/mqtt/data' \
  --exclude='/home/xcat2008/casalume/infra/mqtt/log' \
  --exclude='/home/xcat2008/casalume/infra/zigbee2mqtt/log' \
  --exclude='/home/xcat2008/casalume/infra/zigbee2mqtt/data/log' \
  -czf /home/xcat2008/backups/casalume-dev-$(date +%F-%H%M%S).tar.gz \
  /home/xcat2008/casalume

sudo docker compose config >/dev/null
sudo docker compose build
sudo docker compose up -d

sleep 12

curl -fsS http://127.0.0.1:4101/api/health >/dev/null
curl -fsS http://127.0.0.1:4180 >/dev/null

sudo docker compose ps

echo "Deploy DEV concluído com sucesso."
echo "Web: http://192.168.50.218:4180"
echo "API: http://192.168.50.218:4101/api/health"
echo "Zigbee2MQTT: http://192.168.50.218:8080"
