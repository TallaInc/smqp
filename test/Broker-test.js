import {Broker} from '../index';

describe('Smqp', () => {
  describe('broker properties', () => {
    it('exposes owner as owner', () => {
      const owner = {};
      const broker = Broker(owner);

      expect(broker.owner).to.equal(owner);
    });
  });

  describe('subscribe()', () => {
    it('creates topic exchange with passed exchange name if not exists', () => {
      const broker = Broker();

      broker.subscribe('test', 'test.#', 'persist', () => {});

      const exchange = broker.getExchange('test');
      expect(exchange).to.be.ok;
      expect(exchange).to.have.property('type', 'topic');
    });

    it('throws if subscribe without routingKey pattern', () => {
      const broker = Broker();
      broker.assertExchange('test');

      expect(() => broker.subscribe('test', '', 'persist', () => {})).to.throw(Error);
    });

    it('throws if subscribe without onMessage callback', () => {
      const broker = Broker();

      expect(() => broker.subscribe('test', 'test.#', 'persist')).to.throw(Error);
    });

    it('pass options to exchange and queue', () => {
      const broker = Broker();

      broker.subscribe('test', 'test.#', 'persist-q', onMessage, {durable: true, autoDelete: false});
      expect(broker.getQueue('persist-q').options).to.have.property('autoDelete', false);

      function onMessage() {}
    });

    it('subscription with durable queue is autoDelete by default', () => {
      const broker = Broker();

      broker.subscribe('test', 'test.#', 'persist-q', onMessage, {durable: true});
      expect(broker.getQueue('persist-q').options).to.have.property('autoDelete', true);

      function onMessage() {}
    });

    it('returns owner in message callback', (done) => {
      const owner = {};
      const broker = Broker(owner);

      broker.assertExchange('test');
      broker.subscribe('test', 'test.*', 'test-q', onMessage);

      broker.publish('test', 'test.1');

      function onMessage(routingKey, message, brokerOwner) {
        expect(brokerOwner).to.equal(owner);
        done();
      }
    });

    it('returns existing consumer if the same queue, pattern, and handler are used when subscribing', (done) => {
      const broker = Broker();

      broker.assertExchange('event');
      const consumer1 = broker.subscribe('event', 'test.*', 'test-q', onMessage);
      const consumer2 = broker.subscribe('event', 'test.*', 'test-q', onMessage);

      expect(consumer1 === consumer2).to.be.true;

      broker.publish('event', 'test.1');

      function onMessage() {
        done();
      }
    });

    it('throws if subscribing with NOT durable to durable queue', () => {
      const broker = Broker();
      broker.subscribe('test', 'test.#', 'durableQueue', onMessage1, {durable: true});

      expect(() => {
        broker.subscribe('test', 'test.#', 'durableQueue', onMessage2, {durable: false, memem: 1});
      }).to.throw(/durable/i);

      function onMessage1() {}
      function onMessage2() {}
    });

    it('supports subscribe with general wildcard hash (#)', (done) => {
      const broker = Broker();

      broker.assertExchange('test');
      broker.subscribeTmp('test', '#', onMessage);

      let messageCount = 0;

      broker.publish('test', 'test');
      broker.publish('test', 'test1');

      function onMessage(routingKey, message) {
        ++messageCount;
        if (routingKey === 'test1') {
          expect(messageCount).to.equal(2);
          done();
        } else {
          message.ack();
        }
      }
    });
  });

  describe('exclusive subscription', () => {
    it('throws if subscribing to exclusively consumed queue', () => {
      const broker = Broker();

      broker.subscribe('test', 'test.#', 'exclusive-q', onMessage1, {exclusive: true});

      expect(() => {
        broker.subscribe('test', 'test.#', 'exclusive-q', onMessage2);
      }).to.throw(/exclusively/i);

      function onMessage1() {}
      function onMessage2() {}
    });

    it('cannot exclusively subscribe if already consumed', () => {
      const broker = Broker();

      broker.subscribe('test', 'test.#', 'exclusive-q', onMessage1);

      expect(() => {
        broker.subscribe('test', 'test.#', 'exclusive-q', onMessage2, {exclusive: true});
      }).to.throw(Error);

      function onMessage1() {}
      function onMessage2() {}
    });

    it('releases exclusive consumption if unsubscribed', () => {
      const broker = Broker();

      const queue = broker.assertQueue('exclusive-q', {autoDelete: false});
      broker.subscribe('test', 'test.#', 'exclusive-q', onMessage1, {exclusive: true});

      expect(queue).to.have.property('exclusive', true);

      broker.unsubscribe('exclusive-q', onMessage1);
      expect(queue).to.have.property('exclusive', false);

      broker.subscribe('test', 'test.#', 'exclusive-q', onMessage2);

      function onMessage1() {}
      function onMessage2() {}
    });
  });

  describe('subscribeTmp()', () => {
    it('supports subscribe with suffixed wildcard hash (test.#)', (done) => {
      const broker = Broker();

      broker.assertExchange('test');
      broker.subscribeTmp('test', 'test.#', onMessage);

      let messageCount = 0;

      broker.publish('test', 'test.0');
      broker.publish('test', 'test.1');

      function onMessage(routingKey, message) {
        ++messageCount;
        if (routingKey === 'test.1') {
          expect(messageCount).to.equal(2);
          done();
        } else {
          message.ack();
        }
      }
    });

    it('supports subscribe with the same function and different pattern', (done) => {
      const broker = Broker();

      broker.assertExchange('test');
      broker.subscribeTmp('test', 'test1', onMessage);
      broker.subscribeTmp('test', 'test', onMessage);

      let messageCount = 0;

      broker.publish('test', 'test');
      broker.publish('test', 'test1');

      function onMessage(routingKey, message) {
        ++messageCount;
        if (routingKey === 'test1') {
          expect(messageCount).to.equal(2);
          done();
        } else {
          message.ack();
        }
      }
    });

    it('with consumer tag passes tag to consumer', () => {
      const broker = Broker();

      broker.assertExchange('event');
      const consumer = broker.subscribeTmp('event', '#', onMessage, {consumerTag: 'guid'});

      expect(consumer).to.have.property('consumerTag', 'guid');

      function onMessage() {}
    });
  });

  describe('subscribeOnce()', () => {
    it('creates exchange and temporary queue', () => {
      const broker = Broker();
      const consumer = broker.subscribeOnce('event', 'test.#', onMessage);
      expect(broker.assertExchange('event')).to.be.ok;
      expect(broker.getQueue(consumer.queue.name)).to.be.ok;
      expect(broker.getQueue(consumer.queue.name).options).to.include({durable: false, autoDelete: true});
      function onMessage() {}
    });

    it('receives one message and then closes consumer and queue', () => {
      const broker = Broker();
      const consumer = broker.subscribeOnce('event', 'test.#', onMessage);

      let message;
      broker.publish('event', 'test.1');
      broker.publish('event', 'test.2');

      expect(message).to.be.ok;
      expect(message.fields).to.have.property('routingKey', 'test.1');

      expect(broker.getQueue(consumer.queueName)).to.not.be.ok;

      function onMessage(_, msg) {
        message = msg;
      }
    });

    it('with consumer tag passes tag to consumer', () => {
      const broker = Broker();

      broker.assertExchange('event');
      const consumer = broker.subscribeOnce('event', '#', onMessage, {consumerTag: 'guid'});

      expect(consumer).to.have.property('consumerTag', 'guid');

      function onMessage() {}
    });

    it('subscribeOnce with falsey consumer tag sets unique tag to consumer', () => {
      const broker = Broker();

      broker.assertExchange('event');
      const consumer = broker.subscribeOnce('event', '#', onMessage, {consumerTag: ''});

      expect(consumer).to.have.property('consumerTag').that.is.ok;

      function onMessage() {}
    });

    it('subscribeOnce with high priority receives messages according to priority', () => {
      const broker = Broker();

      const messages = [];

      broker.assertExchange('event');
      broker.subscribeTmp('event', '#', onMessage, {consumerTag: '_tmp', noAck: true, priority: 99});
      broker.subscribeOnce('event', '#', onMessage, {consumerTag: '_once', priority: 100});

      broker.publish('event', 'test.priority');

      expect(messages).to.have.length(2);
      expect(messages[0].fields).to.have.property('consumerTag', '_once');
      expect(messages[1].fields).to.have.property('consumerTag', '_tmp');

      function onMessage(_, msg) {
        messages.push(msg);
      }
    });

    it('closes consumer immediately after message is received', () => {
      const broker = Broker();

      const exchange = broker.assertExchange('event');
      const onceConsumer = broker.subscribeOnce('event', '#', onMessage);
      expect(onceConsumer).to.be.ok;
      expect(onceConsumer.options).to.have.property('noAck', true);


      const onceQueue = broker.getQueue(onceConsumer.queueName);
      expect(onceQueue).to.be.ok;
      expect(onceQueue.options).to.have.property('durable', false);
      expect(onceQueue.options).to.have.property('autoDelete', true);

      expect(exchange).to.have.property('bindingCount', 1);

      const messages = [];

      broker.publish('event', 'once');
      broker.publish('event', 'twice');

      expect(exchange).to.have.property('bindingCount', 0);

      expect(messages).to.eql(['once']);

      function onMessage(routingKey) {
        messages.push(routingKey);
      }
    });

    it('throws if message callback is not a function', () => {
      const broker = Broker();

      broker.assertExchange('event');
      expect(() => {
        broker.subscribeOnce('event', '#');
      }).to.throw(/message callback/);
      expect(() => {
        broker.subscribeOnce('event', '#', 'not-fn');
      }).to.throw(/message callback/);
    });
  });

  describe('unsubscribe()', () => {
    it('unsubscribe in message callback removes consumer', () => {
      const broker = Broker();

      const queue = broker.assertQueue('testq');
      broker.subscribe('test', 'test.*', 'testq', onMessage1);
      broker.subscribe('test', 'test.#', 'testq', onMessage2);

      expect(queue.consumerCount).to.equal(2);

      broker.publish('test', 'test.1');
      broker.publish('test', 'test.1');
      broker.publish('test', 'test.1');

      expect(queue.consumerCount).to.equal(1);

      function onMessage1() {
        broker.unsubscribe('testq', onMessage2);
      }

      function onMessage2() {}
    });

    it('unsubscribe from exclusive consumer with autoDelete queue removes queue', () => {
      const broker = Broker();
      broker.assertExchange('test');
      broker.assertQueue('test-q', {durable: true, autoDelete: true});
      broker.bindQueue('test-q', 'test', '#');

      broker.publish('test', 'test.1');
      broker.publish('test', 'test.2');
      broker.publish('test', 'test.3');
      broker.publish('test', 'test.4');

      broker.subscribe('test', 'test.*', 'test-q', onMessage, {exclusive: true});

      expect(broker.getQueue('test-q')).to.be.undefined;

      function onMessage(routingKey, message) {
        if (routingKey === 'test.4') broker.unsubscribe('test-q', onMessage);
        message.ack();
      }
    });

    it('unsubscribe from durable, persistant queue nacks all messages', () => {
      const broker = Broker();
      const queue = broker.assertQueue('test-q', {durable: true, autoDelete: false});
      broker.sendToQueue('test-q', 'test.1');
      broker.sendToQueue('test-q', 'test.2');
      broker.sendToQueue('test-q', 'test.3');
      broker.sendToQueue('test-q', 'test.4');

      broker.subscribe('test', 'test.*', 'test-q', onMessage, {exclusive: true});

      expect(queue.messageCount).to.equal(3);
      const peekMessage = queue.peek();
      expect(peekMessage.content).to.equal('test.2');
      expect(peekMessage.pending).to.be.false;

      function onMessage(routingKey, message) {
        if (message.content === 'test.2') return broker.unsubscribe('test-q', onMessage);
        message.ack();
      }
    });

    it('unsubscribe in message callback after ack stops receiving messages', () => {
      const broker = Broker();
      const queue = broker.assertQueue('test-q', {durable: true, autoDelete: false});
      broker.subscribe('test', 'test.*', 'test-q', onMessage);

      const messages = [];

      broker.publish('test', 'test.1');
      broker.publish('test', 'test.2');
      broker.publish('test', 'test.3');

      expect(messages).to.eql(['test.1']);
      expect(queue.messageCount).to.equal(2);

      function onMessage(routingKey, message) {
        messages.push(routingKey);
        message.ack();
        broker.unsubscribe('test-q', onMessage);
      }
    });

    it('returns undefined', () => {
      const broker = Broker();

      const queue = broker.assertQueue('test-q');
      broker.subscribe('test', 'test.*', 'test-q', onMessage);

      expect(broker.unsubscribe('test-q', onMessage)).to.be.undefined;
      expect(queue.consumerCount).to.equal(0);

      function onMessage() {}
    });
  });

  describe('consume()', () => {
    it('returns consumer', () => {
      const broker = Broker();

      broker.assertQueue('test-q');
      const consumer = broker.consume('test-q', () => {});
      expect(consumer).to.be.ok;
      expect(consumer).to.have.property('cancel').that.is.a('function');
    });

    it('keeps count of consumers', () => {
      const broker = Broker();

      broker.assertQueue('test-q');

      const consumer1 = broker.consume('test-q', () => {});
      broker.consume('test-q', () => {});

      expect(broker).to.have.property('consumerCount', 2);

      broker.cancel(consumer1.consumerTag);
      expect(broker).to.have.property('consumerCount', 1);
    });

    it('consume exclusive disallows others to consume same queue', () => {
      const broker = Broker();

      broker.assertQueue('test-q');
      broker.consume('test-q', () => {}, {exclusive: true});

      expect(() => {
        broker.consume('test-q', () => {});
      }).to.throw(/exclusively/);
    });

    it('exclusive consumption is released when consumer is cancelled', () => {
      const broker = Broker();

      broker.assertQueue('test-q', {autoDelete: false});
      const exclusive = broker.consume('test-q', () => {}, {exclusive: true});

      expect(() => {
        broker.consume('test-q', () => {});
      }).to.throw(/exclusively/);

      exclusive.cancel();
      broker.consume('test-q', () => {});
    });

    it('consumer tag must be unique', () => {
      const broker = Broker();

      broker.assertQueue('test');
      broker.consume('test', onMessage, {consumerTag: 'guid'});

      expect(() => {
        broker.consume('test', () => {}, {consumerTag: 'guid'});
      }).to.throw(Error, /guid/);

      function onMessage() {}
    });

    it('passes consumerTag option to the consumer', () => {
      const broker = Broker();
      broker.assertQueue('test');
      const consumer = broker.consume('test', onMessage, {exclusive: true, consumerTag: 'guid'});
      expect(consumer).to.have.property('consumerTag', 'guid');

      function onMessage() {}
    });

    it('consume non-existing queue throws', () => {
      const broker = Broker();
      expect(() => {
        broker.consume('non-q', () => {}, {exclusive: true, consumerTag: 'guid'});
      }).to.throw(/not found/);
    });
  });

  describe('asserExchange()', () => {
    it('creates exchange if it doesn´t exist', () => {
      const broker = Broker();

      const exchange = broker.assertExchange('test');
      expect(exchange).to.be.ok;
    });

    it('throws if type is not topic or direct', () => {
      const broker = Broker();

      expect(() => {
        broker.assertExchange('test', 'fanout');
      }).to.throw(/topic or direct/);
      expect(() => {
        broker.assertExchange('test', new Date());
      }).to.throw(/topic or direct/);
      expect(() => {
        broker.assertExchange('test', {});
      }).to.throw(/topic or direct/);
      expect(() => {
        broker.assertExchange('test', () => {});
      }).to.throw(/topic or direct/);
    });

    it('returns the same exchange if it exists', () => {
      const broker = Broker();

      const exchange1 = broker.assertExchange('test');
      const exchange2 = broker.assertExchange('test');
      expect(exchange1 === exchange2).to.be.true;
    });

    it('throws if exchange type is not the same as existing type', () => {
      const broker = Broker();
      broker.assertExchange('test', 'direct');
      expect(() => {
        broker.assertExchange('test', 'fanout');
      }).to.throw(/match/);
    });

    it('asserExchange() throws if exchange type is not the same as existing type', () => {
      const broker = Broker();

      broker.assertExchange('test', 'direct');
      expect(() => {
        broker.assertExchange('test', 'fanout');
      }).to.throw(/match/);
    });
  });

  describe('deleteExchange()', () => {
    it('ignored if exchange doesn´t exist', () => {
      const broker = Broker();
      expect(broker.deleteExchange('none')).to.be.false;
    });

    it('deletes exchange', () => {
      const broker = Broker();
      broker.assertExchange('event');
      expect(broker.deleteExchange('event')).to.be.true;
      expect(broker.getExchange('event')).to.not.be.ok;
    });

    it('keeps exchange if used and called with ifUnused true', () => {
      const broker = Broker();
      broker.assertExchange('event');
      broker.subscribeOnce('event', '#', () => {});
      expect(broker.deleteExchange('event', {ifUnused: true})).to.be.false;
      expect(broker.getExchange('event')).to.be.ok;
    });

    it('deletes exchange if unused and called with ifUnused true', () => {
      const broker = Broker();
      broker.assertExchange('event');
      expect(broker.deleteExchange('event', true)).to.be.true;
      expect(broker.getExchange('event')).to.not.be.ok;
    });
  });

  describe('getState()', () => {
    it('returns durable exchange', () => {
      const broker = Broker();

      broker.assertExchange('test', 'topic', {durable: true});

      const state = broker.getState();
      expect(state).to.have.property('exchanges').with.length(1);
      expect(state.exchanges[0]).to.have.property('options').with.property('durable', true);
    });

    it('doesn´t return non-durable exchange', () => {
      const broker = Broker();

      broker.assertExchange('durable', 'topic');
      broker.assertExchange('non-durable', 'topic', {durable: false});

      const state = broker.getState();

      expect(state).to.have.property('exchanges').with.length(1);
      expect(state.exchanges[0]).to.have.property('name', 'durable');
    });

    it('returns durable queue', () => {
      const broker = Broker();

      broker.assertQueue('test', {durable: true});

      const state = broker.getState();
      expect(state).to.have.property('queues').with.length(1);
      expect(state.queues[0]).to.have.property('options').with.property('durable', true);
    });

    it('doesn´t return non-durable exchange', () => {
      const broker = Broker();

      broker.assertQueue('durable');
      broker.assertQueue('non-durable', {durable: false});

      const state = broker.getState();

      expect(state).to.have.property('queues').with.length(1);
      expect(state.queues[0]).to.have.property('name', 'durable');
    });

    it('doesn´t return non-durable binding to exchange', () => {
      const broker = Broker();

      broker.assertExchange('event', 'topic', {durable: true, autoDelete: false});
      broker.assertQueue('durable', {durable: true});
      broker.assertQueue('non-durable', {durable: false});
      broker.bindQueue('durable', 'event', '#');
      broker.bindQueue('non-durable', 'event', '#');

      const state = broker.getState();

      expect(state).to.have.property('queues').with.length(1);
      expect(state).to.have.property('exchanges').with.length(1);
      expect(state.exchanges[0]).to.have.property('bindings').with.length(1);
    });
  });

  describe('stop()', () => {
    let broker;
    beforeEach('setup exchanges and queues', () => {
      broker = Broker();
      broker.assertExchange('event', 'topic', {autoDelete: false});
      broker.assertExchange('load', 'direct', {autoDelete: false});

      broker.assertQueue('events', {autoDelete: false});
      broker.assertQueue('loads', {autoDelete: false});

      broker.bindQueue('events', 'event', '#');
      broker.bindQueue('loads', 'load', '#');
    });

    it('stops publishing messages and consumption', () => {
      const messages = [];

      broker.consume('events', onMessage);
      broker.consume('loads', onMessage);

      broker.publish('event', 'event.1');
      broker.publish('load', 'load.1');

      broker.stop();

      broker.publish('event', 'event.2');
      broker.publish('load', 'load.2');

      broker.getQueue('events').queueMessage('event.stopped');
      broker.getQueue('loads').queueMessage('load.stopped');

      expect(messages).to.eql([
        'event.1',
        'load.1',
      ]);

      function onMessage(routingKey, message) {
        messages.push(routingKey);
        message.ack();
      }
    });

    it('keeps consumers', () => {
      const messages = [];

      const consumer = broker.subscribeTmp('event', '#', onMessage);

      broker.publish('event', 'event.1');
      broker.publish('event', 'event.2');

      broker.stop();

      broker.publish('event', 'event.3');

      const tmpQueue = broker.getQueue(consumer.queueName);
      expect(tmpQueue).to.be.ok;
      expect(tmpQueue).to.have.property('consumerCount', 1);

      tmpQueue.queueMessage('event.queued');

      expect(messages).to.eql([
        'event.1',
        'event.2',
      ]);

      function onMessage(routingKey, message) {
        messages.push(routingKey);
        message.ack();
      }
    });

    it('keeps same state before and after stop', () => {
      const messages = [];

      broker.consume('events', onMessage);
      broker.consume('loads', onMessage);

      broker.publish('event', 'event.1');
      broker.publish('load', 'load.1');

      const state = broker.getState();

      broker.stop();

      expect(broker.getState()).to.eql(state);

      function onMessage(routingKey, message) {
        messages.push(routingKey);
        message.ack();
      }
    });
  });

  describe('close()', () => {
    let broker;
    beforeEach('setup exchanges and queues', () => {
      broker = Broker();
      broker.assertExchange('event', 'topic', {autoDelete: false});
      broker.assertExchange('load', 'direct', {autoDelete: false});

      broker.assertQueue('events', {autoDelete: false});
      broker.assertQueue('loads', {autoDelete: false});

      broker.bindQueue('events', 'event', '#');
      broker.bindQueue('loads', 'load', '#');
    });

    it('stops publishing messages and consumption', () => {
      const messages = [];

      broker.consume('events', onMessage);
      broker.consume('loads', onMessage);

      broker.publish('event', 'event.1');
      broker.publish('load', 'load.1');

      broker.close();

      broker.publish('event', 'event.2');
      broker.publish('load', 'load.2');

      broker.getQueue('events').queueMessage('event.stopped');
      broker.getQueue('loads').queueMessage('load.stopped');

      expect(messages).to.eql([
        'event.1',
        'load.1',
      ]);

      function onMessage(routingKey, message) {
        messages.push(routingKey);
        message.ack();
      }
    });

    it('removes consumers', () => {
      const messages = [];

      const consumer = broker.subscribeTmp('event', '#', onMessage);

      broker.publish('event', 'event.1');
      broker.publish('event', 'event.2');

      broker.close();

      broker.publish('event', 'event.3');

      const tmpQueue = broker.getQueue(consumer.queueName);
      expect(tmpQueue).to.be.ok;
      expect(tmpQueue).to.have.property('consumerCount', 0);

      tmpQueue.queueMessage('event.queued');

      expect(messages).to.eql([
        'event.1',
        'event.2',
      ]);

      function onMessage(routingKey, message) {
        messages.push(routingKey);
        message.ack();
      }
    });

    it('keeps same state before and after stop', () => {
      const messages = [];

      broker.consume('events', onMessage);
      broker.consume('loads', onMessage);

      broker.publish('event', 'event.1');
      broker.publish('load', 'load.1');

      const state = broker.getState();

      broker.stop();

      expect(broker.getState()).to.eql(state);

      function onMessage(routingKey, message) {
        messages.push(routingKey);
        message.ack();
      }
    });
  });

  describe('recover()', () => {
    let broker;
    beforeEach('setup exchanges and queues', () => {
      broker = Broker();
      broker.assertExchange('event', 'topic', {autoDelete: false});
      broker.assertExchange('load', 'direct', {autoDelete: false});

      broker.assertQueue('event-q', {autoDelete: false});
      broker.assertQueue('load-q', {autoDelete: false});

      broker.bindQueue('event-q', 'event', '#', {priority: 0});
      broker.bindQueue('load-q', 'load', 'load.#');
    });

    it('recovers topic exchange', () => {
      const recoveredBroker = Broker().recover(broker.getState());

      const recoveredExchange = recoveredBroker.getExchange('event');
      expect(recoveredExchange).to.be.ok;
      expect(recoveredExchange).to.have.property('type', 'topic');
      expect(recoveredExchange).to.have.property('bindingCount', 1);
    });

    it('recovers bindings', () => {
      broker.bindQueue('event-q', 'event', 'event.#', {priority: 30});

      const recoveredBroker = Broker().recover(broker.getState());

      const {bindingCount, bindings} = recoveredBroker.getExchange('event');
      expect(bindingCount).to.equal(2);
      expect(bindings[0]).to.have.property('pattern', 'event.#');
      expect(bindings[0].options).to.have.property('priority', 30);
      expect(bindings[1]).to.have.property('pattern', '#');
    });

    it('same broker with state keeps consumers', () => {
      broker.consume('event-q', () => {});

      expect(broker.consumerCount).to.equal(1);

      broker.recover(broker.getState());

      expect(broker.consumerCount).to.equal(1);
    });

    it('peek returns first recovered message', () => {
      broker.publish('event', 'event.0', {data: 1});
      broker.publish('event', 'event.1', {data: 2});

      broker.consume('event-q', onMessage);

      const recoveredBroker = Broker();
      recoveredBroker.recover(broker.getState());

      recoveredBroker.consume('event-q', onMessage);

      const recoveredMessage = recoveredBroker.getQueue('event-q').peek();

      expect(recoveredMessage.fields).to.have.property('routingKey', 'event.0');
      expect(recoveredMessage).to.have.property('content').that.eql({data: 1});

      function onMessage() {}
    });

    it('recovers topic exchange in stopped broker', (done) => {
      const messages = [];

      broker.consume('event-q', onMessage);
      broker.subscribeTmp('event', 'event.1', stop);

      broker.publish('event', 'event.0');
      broker.publish('event', 'event.1');
      broker.publish('event', 'event.2');

      function onMessage(routingKey) {
        messages.push(routingKey);
      }

      function stop() {
        broker.stop();
        broker.publish('event', 'event.ignored');

        broker.recover();

        broker.publish('event', 'event.2');

        broker.consume('event-q', onRecoveredMessage);

        expect(messages).to.eql([
          'event.0',
          'event.1',
          'event.2',
        ]);
      }

      function onRecoveredMessage() {
        done();
      }
    });

    it('recover with state recovers bindings with descending priority', () => {
      const messages = [];

      broker.assertQueue('event-prio-q');
      broker.assertQueue('event-secondi-q');
      broker.bindQueue('event-prio-q', 'event', '#', {priority: 100});

      broker.consume('event-q', onMessage);
      broker.consume('event-prio-q', onPrioMessage);

      broker.publish('event', 'event.0');

      broker.stop();
      const recovered = Broker().recover(broker.getState());

      expect(broker.getState()).to.deep.eql(recovered.getState());

      recovered.consume('event-q', onMessage);
      recovered.consume('event-prio-q', onPrioMessage);

      recovered.publish('event', 'event.1');

      expect(messages).to.eql([
        'prio-event.0',
        'event.0',
        'prio-event.1',
        'event.1',
      ]);

      function onMessage(routingKey, message) {
        messages.push(routingKey);
        message.ack();
      }
      function onPrioMessage(routingKey, message) {
        messages.push(['prio', routingKey].join('-'));
        message.ack();
      }
    });

    it('recover without state recovers bindings with descending priority', () => {
      const messages = [];

      broker.subscribeOnce('event', '#', (routingKey) => {
        messages.push(['once', routingKey].join('-'));
      });

      broker.assertQueue('event-prio-q');
      broker.assertQueue('event-secondi-q');
      broker.bindQueue('event-prio-q', 'event', '#', {priority: 100});

      broker.consume('event-q', onMessage);
      broker.consume('event-prio-q', onPrioMessage);

      broker.publish('event', 'event.0');

      broker.stop();

      broker.recover();

      broker.consume('event-q', onMessage);
      broker.consume('event-prio-q', onPrioMessage);

      broker.publish('event', 'event.1');

      expect(messages).to.eql([
        'prio-event.0',
        'event.0',
        'once-event.0',
        'prio-event.1',
        'event.1',
      ]);

      function onMessage(routingKey, message) {
        messages.push(routingKey);
        message.ack();
      }
      function onPrioMessage(routingKey, message) {
        messages.push(['prio', routingKey].join('-'));
        message.ack();
      }
    });

    it('without state continues consumption', () => {
      const messages = [];

      const consumer = broker.subscribeTmp('event', '#', onMessage);

      broker.publish('event', 'event.1');
      broker.publish('event', 'event.2');

      broker.stop();

      broker.publish('event', 'event.3');

      const tmpQueue = broker.getQueue(consumer.queueName);
      expect(tmpQueue).to.be.ok;
      expect(tmpQueue).to.have.property('consumerCount', 1);

      broker.recover();

      broker.publish('event', 'event.4');

      expect(messages).to.eql([
        'event.1',
        'event.2',
        'event.4',
      ]);

      function onMessage(routingKey, message) {
        messages.push(routingKey);
        message.ack();
      }
    });
  });

  describe('unbindQueue()', () => {
    it('stops receiving messages from exchange', () => {
      const broker = Broker();
      broker.assertExchange('event');
      const q = broker.assertQueue('event-q');

      broker.bindQueue('event-q', 'event', '#');

      broker.publish('event', 'test.1');
      expect(q.messageCount).to.equal(1);

      broker.unbindQueue('event-q', 'event', '#');

      broker.publish('event', 'test.1');
      expect(q.messageCount).to.equal(1);
    });

    it('unbind from non-existing exchange is ignored', () => {
      const broker = Broker();
      broker.assertExchange('event');
      broker.assertQueue('event-q');
      broker.unbindQueue('event-q', 'non-event', '#');
    });

    it('unbind from non-existing queue is ignored', () => {
      const broker = Broker();
      broker.assertExchange('event');
      broker.assertQueue('event-q');
      broker.unbindQueue('non-q', 'event', '#');
    });
  });

  describe('cancel(consumerTag)', () => {
    it('stops consuming messages', () => {
      const broker = Broker();
      broker.assertExchange('event');
      const messages = [];

      broker.subscribeTmp('event', '#', (routingKey) => messages.push(routingKey), {consumerTag: 'cancel-me', noAck: true});

      broker.publish('event', 'test.1');
      expect(messages).to.have.length(1);

      broker.cancel('cancel-me');

      broker.publish('event', 'test.2');
      expect(messages).to.have.length(1);
    });

    it('is ignored if no consumer tag was found', () => {
      const broker = Broker();
      broker.cancel('cancel-me');
    });
  });

  describe('dead letters', () => {
    it('sends nacked message to dead letter exchange', () => {
      const broker = Broker();

      broker.assertExchange('event');
      broker.assertExchange('dead-letter');
      const deadLetterQueue = broker.assertQueue('dead-letter-q');
      broker.bindQueue('dead-letter-q', 'dead-letter', '#');

      broker.subscribe('event', 'test.#', 'test-q', onMessage, {deadLetterExchange: 'dead-letter'});

      broker.publish('event', 'test.1');
      broker.publish('event', 'test.2');

      expect(deadLetterQueue.messageCount).to.equal(2);

      function onMessage(_, message) {
        message.nack(false, false);
      }
    });

    it('sends rejected message to dead letter exchange', () => {
      const broker = Broker();

      broker.assertExchange('event');
      broker.assertExchange('dead-letter');

      const deadLetterQueue = broker.assertQueue('dead-letter-q');
      broker.bindQueue('dead-letter-q', 'dead-letter', '#');

      broker.subscribe('event', 'test.#', 'test-q', onMessage, {deadLetterExchange: 'dead-letter'});

      broker.publish('event', 'test.1');

      expect(deadLetterQueue.messageCount).to.equal(1);

      function onMessage(_, message) {
        message.reject(false);
      }
    });

    it('requeued message is not sent to dead letter exchange', () => {
      const broker = Broker();

      broker.assertExchange('event');
      broker.assertExchange('dead-letter');
      const deadLetterQueue = broker.assertQueue('dead-letter-q');
      broker.bindQueue('dead-letter-q', 'dead-letter', '#');

      broker.subscribe('event', 'test.#', 'test-q', onMessage, {deadLetterExchange: 'dead-letter'});

      const messages = [];
      broker.publish('event', 'test.reject');
      broker.publish('event', 'test.nack');

      expect(deadLetterQueue.messageCount).to.equal(0);

      function onMessage(routingKey, message) {
        if (messages.indexOf(message)) return;
        messages.push(message);
        if (routingKey === 'test.reject') message.reject(true);
        message.nack(false, true);
      }
    });
  });

  describe('queues', () => {
    it('keeps count', () => {
      const broker = Broker();
      expect(broker.queueCount).to.equal(0);
      broker.assertQueue('test-q');
      expect(broker.queueCount).to.equal(1);
      broker.deleteQueue('test-q');
      expect(broker.queueCount).to.equal(0);
    });
  });

  describe('exchanges', () => {
    it('keeps count', () => {
      const broker = Broker();
      expect(broker.exchangeCount).to.equal(0);
      broker.assertExchange('event');
      expect(broker.exchangeCount).to.equal(1);
      broker.deleteExchange('event');
      expect(broker.exchangeCount).to.equal(0);
    });
  });

  describe('messages', () => {
    it('messages are distributed by descending priority', () => {
      const broker = Broker();
      const messages = [];

      broker.assertExchange('event', 'topic');

      broker.subscribe('event', 'test.#', 'test-q', onMessageFirst, {priority: 1});
      broker.subscribe('event', 'test.#', 'test-q', onMessageThird, {priority: 0});
      broker.subscribe('event', 'test.#', 'test-q', onMessageVip, {priority: 2});

      broker.publish('event', 'test.1');
      broker.publish('event', 'test.2');
      broker.publish('event', 'test.3');

      expect(messages).to.eql(['vip', 'first', 'third']);

      function onMessageFirst() {
        messages.push('first');
      }

      function onMessageThird() {
        messages.push('third');
      }

      function onMessageVip() {
        messages.push('vip');
      }
    });

    it('delivers content', (done) => {
      const broker = Broker();

      broker.subscribeTmp('test', '#', onMessage);

      broker.publish('test', 'test.1', {
        num: 1
      });

      function onMessage(routingKey, message) {
        expect(message).to.have.property('content').that.eql({num: 1});
        done();
      }
    });

    it('releases next message when acked', () => {
      const broker = Broker();

      broker.subscribeTmp('test', '#', onMessage);

      let firstMessage, secondMessage;

      broker.publish('test', 'test1');
      broker.publish('test', 'test2');

      expect(firstMessage, 'message #1').to.be.ok;
      expect(secondMessage, 'message #2').to.not.be.ok;

      firstMessage.ack();

      expect(secondMessage, 'message #2').to.be.ok;

      function onMessage(routingKey, message) {
        if (routingKey === 'test1') {
          firstMessage = message;
        }
        if (routingKey === 'test2') {
          secondMessage = message;
        }
      }
    });

    it('releases next message when nacked', () => {
      const broker = Broker();

      broker.subscribeTmp('test', '#', onMessage);

      const messages = [];

      broker.publish('test', 'test1');
      broker.publish('test', 'test2');

      expect(messages).to.have.length(1);

      const [message1] = messages;

      message1.nack();

      expect(messages).to.have.length(2);

      function onMessage(routingKey, message) {
        messages.push(message);
      }
    });

    it('releases message back to original position if nacked with requeue', () => {
      const broker = Broker();

      broker.subscribe('test', '#', 'testq', onMessage, {autoDelete: false});

      const messages = [];

      broker.publish('test', 'test1');
      broker.publish('test', 'test2');

      expect(messages).to.have.length(1);

      const [message1] = messages;

      broker.unsubscribe('#', onMessage);

      message1.nack(null, true);

      expect(broker.getQueue('testq').messageCount).to.equal(2);

      function onMessage(routingKey, message) {
        messages.push(message);
      }
    });

    it('ack allUpTo argument acknowledges all outstanding messages up to the current one', () => {
      const broker = Broker();

      broker.subscribe('test', '#', 'testq', onMessage, {prefetch: 2});

      const messages = [];

      broker.publish('test', 'test1');
      broker.publish('test', 'test2');
      broker.publish('test', 'test3');

      expect(messages).to.eql(['test2', 'test3']);
      expect(broker.getQueue('testq').messageCount).to.equal(0);

      function onMessage(routingKey, message) {
        if (routingKey === 'test1') return;
        messages.push(routingKey);
        message.ack(true);
      }
    });

    it('nack allUpTo argument acknowledges all outstanding messages up to the current one', () => {
      const broker = Broker();

      broker.subscribe('test', '#', 'test-q', onMessage, {prefetch: 2});

      const messages = [];

      broker.publish('test', 'test1');
      broker.publish('test', 'test2');
      broker.publish('test', 'test3');

      expect(messages).to.eql(['test2', 'test3']);
      expect(broker.getQueue('test-q').messageCount).to.equal(0);

      function onMessage(routingKey, message) {
        if (routingKey === 'test1') return;
        messages.push(routingKey);
        message.nack(true, false);
      }
    });
  });

  describe('multiple exchanges and queues', () => {
    let broker;
    beforeEach('setup exchanges and queues', () => {
      broker = Broker();

      broker.assertExchange('load', 'direct');
      broker.assertQueue('load1-q', {autoDelete: false});
      broker.assertQueue('load2-q', {autoDelete: false});

      broker.assertExchange('event', 'topic');
      broker.assertQueue('event-q', {autoDelete: false});

      broker.bindQueue('event-q', 'event', '#');
      broker.bindQueue('load1-q', 'load', '#');
      broker.bindQueue('load2-q', 'load', '#');
    });

    it('are recovered with bindings', () => {
      const state = broker.getState();
      const newBroker = Broker().recover(state);

      newBroker.publish('event', 'event.1');
      newBroker.publish('load', 'heavy.1');
      newBroker.publish('load', 'heavy.1');

      expect(newBroker.getQueue('event-q').messageCount).to.equal(1);
      expect(newBroker.getQueue('load1-q').messageCount).to.equal(1);
      expect(newBroker.getQueue('load2-q').messageCount).to.equal(1);
    });

    it('are recovered with messages', () => {
      broker.publish('event', 'event.1');
      broker.publish('load', 'heavy.1');
      broker.publish('load', 'heavy.1');

      const state = broker.getState();
      const newBroker = Broker().recover(state);

      expect(newBroker.getQueue('event-q').messageCount).to.equal(1);
      expect(newBroker.getQueue('load1-q').messageCount).to.equal(1);
      expect(newBroker.getQueue('load2-q').messageCount).to.equal(1);
    });

    it('recovers the same broker with bindings', () => {
      const state = broker.getState();
      broker.recover(state);

      broker.publish('event', 'event.1');
      broker.publish('load', 'heavy.1');
      broker.publish('load', 'heavy.1');

      expect(broker.getQueue('event-q').messageCount).to.equal(1);
      expect(broker.getQueue('load1-q').messageCount).to.equal(1);
      expect(broker.getQueue('load2-q').messageCount).to.equal(1);
    });

    it('recovers the same broker with messages', () => {
      broker.publish('event', 'event.1');
      broker.publish('load', 'heavy.1');
      broker.publish('load', 'heavy.1');

      const state = broker.getState();
      broker.recover(state);

      expect(broker.getQueue('event-q').messageCount).to.equal(1);
      expect(broker.getQueue('load1-q').messageCount).to.equal(1);
      expect(broker.getQueue('load2-q').messageCount).to.equal(1);
    });

    it.skip('recoveres multiple direct exchange messages', (done) => {
      const messages = [];

      broker.consume('load1-q', onLoad1);
      broker.consume('load2-q', onLoad2);
      broker.consume('event-q', onEvent);

      broker.subscribeTmp('event', 'event.start', onStart, {noAck: true});

      broker.publish('load', 'start');
      broker.publish('load', 'complete');
      broker.publish('load', 'end');

      function onLoad1(routingKey, message) {
        messages.push(routingKey);
        broker.publish('event', `event.${routingKey}`);
        message.ack();
      }

      function onStart() {
        messages.push('-stop');
        broker.stop();
        const state = broker.getState();
        recover(state);
      }

      function onLoad2(routingKey, message) {
        messages.push(routingKey);
        broker.publish('event', `event.${routingKey}`);
        message.ack();
      }

      function onEvent(routingKey, message) {
        messages.push(routingKey);
        message.ack();
      }

      function recover(state) {
        broker = Broker().recover(state);

        broker.consume('load1-q', onLoad1);
        broker.consume('load2-q', onLoad2);

        setImmediate(() => {
          expect(messages).to.eql([
            'start',
            'event.start',
            '-stop',
            'complete',
            'end',
          ]);

          done();
        });
      }
    });
  });

  describe('broker.prefetch(count)', () => {
    it('has expected behaviour', () => {
      const broker = Broker();
      broker.prefetch();
    });
  });

  describe('purgeQueue(queueName)', () => {
    it('has expected behaviour', () => {
      const broker = Broker();
      const q = broker.assertQueue('test-q');

      broker.sendToQueue('test-q', 'meme');

      expect(q.messageCount).to.equal(1);

      broker.purgeQueue('test-q');

      expect(q.messageCount).to.equal(0);
    });

    it('is ignored if queue is not found', () => {
      const broker = Broker();
      broker.assertQueue('test-q');
      broker.purgeQueue('nan-q');
    });
  });

  describe('events', () => {
    it('emits "return" with message if published mandatory message is not routed to any queue', () => {
      const broker = Broker();
      broker.assertExchange('event');

      let message;
      broker.on('return', (msg) => {
        message = msg;
      });

      broker.publish('event', 'test.1', 'important', {mandatory: true});

      expect(message).to.be.ok;

      expect(message).to.have.property('fields').that.include({
        exchange: 'event',
        routingKey: 'test.1'
      });
      expect(message).to.have.property('content', 'important');
    });

    it('listen for unknown event is ok and doesn´t throw', () => {
      const broker = Broker();
      broker.on('me', () => {});
    });

    it('cancels listener if off is called', () => {
      const broker = Broker();
      const messages = [];
      broker.assertExchange('event');
      broker.on('return', onBrokerReturn);

      broker.publish('event', 'test.1', 'important', {mandatory: true});

      expect(messages).to.have.length(1);

      broker.off('return', onBrokerReturn);

      broker.publish('event', 'test.1', 'important', {mandatory: true});

      expect(messages).to.have.length(1);

      function onBrokerReturn(msg) {
        messages.push(msg);
      }
    });

    it('off(eventName, handler) cancels only handler listener', () => {
      const broker = Broker();
      const messages = [];
      broker.assertExchange('event');
      broker.on('return', onBrokerReturn1);
      broker.on('return', onBrokerReturn2);

      broker.publish('event', 'test.1', 'important', {mandatory: true});

      expect(messages).to.have.length(2);

      broker.off('return', onBrokerReturn2);

      broker.publish('event', 'test.1', 'important', {mandatory: true});

      expect(messages).to.have.length(3);

      function onBrokerReturn1(msg) {
        messages.push(msg);
      }
      function onBrokerReturn2(msg) {
        messages.push(msg);
      }
    });

    it('off(eventName, handler) cancels all handler listeners', () => {
      const broker = Broker();
      const messages = [];
      broker.assertExchange('event');
      broker.on('return', onBrokerReturn);
      broker.on('return', onBrokerReturn);

      broker.publish('event', 'test.1', 'important', {mandatory: true});

      expect(messages).to.have.length(2);

      broker.off('return', onBrokerReturn);

      broker.publish('event', 'test.1', 'important', {mandatory: true});

      expect(messages).to.have.length(2);

      function onBrokerReturn(msg) {
        messages.push(msg);
      }
    });
  });
});
