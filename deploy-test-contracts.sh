#!/bin/sh

# export ETH_RPC=http://0x1234..:@localhost:8545
solar deploy test/contracts/MethodOverloading.sol:MethodOverloading --force
solar deploy test/contracts/Methods.sol:Methods --force
solar deploy test/contracts/Logs.sol:Logs --force
solar deploy test/contracts/LogOfDependantContract.sol:LogOfDependantContract --force
solar deploy test/contracts/ArrayArguments.sol:ArrayArguments --force
