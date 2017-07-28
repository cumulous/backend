#!/bin/sh

DEVICES="$1"
MOUNT="$2"

UID=100

set -e

d=0
for device in ${DEVICES}; do
  d=$((d + 1))
  while [ ! -b ${device} ]; do
    sleep 1
  done
done

if [ $d = 1 ]; then
  drive=${DEVICES}
else
  drive=/dev/md0
  yum install -y mdadm
  mdadm --create ${drive} --level 0 --raid-devices $d ${DEVICES}
fi

mkfs.ext4 ${drive}
mkdir -p ${MOUNT}
mount ${drive} ${MOUNT}
chown ${UID}:root ${MOUNT}
chmod 660 ${MOUNT}

service docker restart || true
start ecs || true
