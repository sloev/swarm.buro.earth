#!/bin/bash

. /root/.nvm/nvm.sh

pushd /etc/bittorrent

npm install

npm start

popd
