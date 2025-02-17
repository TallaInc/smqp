SMQP
====

[![Build Status](https://travis-ci.org/paed01/smqp.svg?branch=master)](https://travis-ci.org/paed01/smqp)[![Build status](https://ci.appveyor.com/api/projects/status/8dy3yrde5pe8mk6m/branch/master?svg=true)](https://ci.appveyor.com/project/paed01/smqp/branch/master)[![Project Status: Active – The project has reached a stable, usable state and is being actively developed.](https://www.repostatus.org/badges/latest/active.svg)](https://www.repostatus.org/#active)

Synchronous message queuing package. Used as an alternative - and frontend ready - event handler when you expect events to be handled in sequence.

Basically a synchronous amqp broker.

# Documentation
- [API](/API.md)

# Usage

```javascript
import {Broker} from 'smqp';

const owner = {name: 'me'};
const broker = Broker(owner);

broker.subscribe('events', '#', 'event-queue', onMessage);

broker.publish('events', 'start', {arg: 1});

function onMessage(routingKey, message, brokerOwner) {
  console.log('received:', routingKey);
  console.log('with message:', message);
  console.log('owned by:', brokerOwner.name);
  message.ack();
}
