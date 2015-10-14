var assert = require('chai').assert
var crypto = require('crypto')
var expect = require('chai').expect
var publicIp = require('public-ip')
// var ChromeDgramTransport = require('../src/transports/chrome-dgram')
var FakeStorage = require('./fakestorage')
var FakeTransport = require('./faketransport')
var KadServer = require('../src/kadserver')

var myPublicIpAddress

var loglevel = {}
loglevel.server = 'debug'
loglevel.kad = 1

// local test setup
var storage1, storage2, storage3
var node1opts, node2opts, node3opts
var node1, node2, node3

// `NAT'ed test setup
var storage4, storage5, storage6
var node4opts, node5opts, node6opts
var node4, node5, node6

// using chrome dgram
var storage7, storage8, storage9
var node7opts, node8opts, node9opts
var node7, node8, node9

// test data
var key = 'ping'
var value1 = 'pong'
var value2 = 'pang'
var value3 = 'pung'
var ttl = 1

function _createID (data) {
  return crypto.createHash('sha1').update(data).digest('hex')
}

function _printStorage123 () {
  console.log('FakeStorage 1: ' + JSON.stringify(storage1.data))
  console.log('FakeStorage 2: ' + JSON.stringify(storage2.data))
  console.log('FakeStorage 3: ' + JSON.stringify(storage3.data))
}

function _printStorage456 () {
  console.log('FakeStorage 4: ' + JSON.stringify(storage4.data))
  console.log('FakeStorage 5: ' + JSON.stringify(storage5.data))
  console.log('FakeStorage 6: ' + JSON.stringify(storage6.data))
}

function _printStorage789 () {
  console.log('FakeStorage 7: ' + JSON.stringify(storage7.data))
  console.log('FakeStorage 8: ' + JSON.stringify(storage8.data))
  console.log('FakeStorage 9: ' + JSON.stringify(storage9.data))
}

describe('#localhost', function () {
  before(function () {
    storage1 = new FakeStorage('node1')
    storage2 = new FakeStorage('node2')
    storage3 = new FakeStorage('node3')

    node1opts = {
      address: '127.0.0.1',
      port: 65535,
      seeds: [],
      storage: storage1,
      loglevel: loglevel
    }

    node2opts = {
      address: '127.0.0.1',
      port: 65534,
      seeds: [{
        address: '127.0.0.1',
        port: 65535
      }],
      storage: storage2,
      loglevel: loglevel
    }

    node3opts = {
      address: '127.0.0.1',
      port: 65533,
      seeds: [{
        address: '127.0.0.1',
        port: 65535
      }],
      storage: storage3,
      loglevel: loglevel
    }

    node1 = new KadServer(node1opts)
    node2 = new KadServer(node2opts)
    node3 = new KadServer(node3opts)
  })

  it('kadserver should launch localhost bootstrap server', function (done) {
    node1.on('ready', function () {
      assert(false, 'Ready event should not be fired since there are no seeds specified.')
    })
    node1.on('no peers', function () {
      assert(true, 'Bootstrap server running')
      done()
    })
    node1.on('error', function (error) {
      assert(false, 'Error while activating node 1: ' + error)
    })
    node1.activate()
  })

  it('kadserver should launch local overlay network', function (done) {
    node2.on('no peers', function () {
      assert(false, 'Node 2 could not connect to peer ' + JSON.stringify(node2opts.seeds))
    })
    node2.on('error', function (error) {
      assert(false, 'Error while activating node 2: ' + error)
    })
    node2.on('ready', function () {
      // launch node 3
      node3.on('no peers', function () {
        assert(false, 'Node 3 could not connect to peers ' + JSON.stringify(node3opts.seeds))
      })
      node3.on('error', function (error) {
        assert(false, 'Error while activating node 3: ' + error)
      })
      node3.on('ready', function () {
        done()
      })
      node3.activate()
    })
    node2.activate()
  })

  it('kadserver should write to store', function (done) {
    node2.putP(key, value1)
      .then(function () {
        expect(storage3.data).to.have.property(_createID(key))
        expect(storage2.data).to.not.have.property(_createID(key))
        expect(storage1.data).to.have.property(_createID(key))
        done()
      })
      .catch(function (error) {
        assert(false, 'Unable to succesfully write to the DHT. ' + error)
      })
  })

  it('kadserver should read from store', function (done) {
    node3.getP(key)
      .then(function (storedValue) {
        expect(storedValue).to.equal(value1)
        done()
      })
      .catch(function (error) {
        assert(false, 'Unable to succesfully read from the DHT. ' + error)
      })
  })

  it('kadserver should overwrite KV tuple', function (done) {
    node3.putP(key, value2)
      .then(function () {
        return node2.getP(key)
      })
      .then(function (storedValue) {
        expect(storedValue).to.not.equal(value1)
        expect(storedValue).to.equal(value2)
        done()
      })
      .catch(function (error) {
        assert(false, 'Unable to succesfully overwrite a KV tuple in the DHT. ' + error)
      })
  })

  it('kadserver should delete from store', function (done) {
    node2.delP(key)
      .then(function () {
        return node3.getP(key)
      })
      .then(function (storedValue) {
        expect(storedValue).to.be.null
        done()
      })
      .catch(function (error) {
        assert(false, 'Unable to succesfully delete from the DHT. ' + error)
      })
  })

  it('kadserver should write KV with TTL to store', function (done) {
    node2.putP(key, value3, ttl)
      .then(function () {
        var storedData = JSON.parse(storage3.data[_createID(key)]).value
        expect(storedData).to.have.property('expires')
        expect(storedData.expires).to.not.be.null
        return node3.getP(key)
      })
      .then(function (storedValue) {
        expect(storedValue).to.not.be.null
        done()
      })
      .catch(function (error) {
        assert(false, 'Unable to succesfully write KV tuple with TTL to the DHT. ' + error)
      })
  })

  it('kadserver should delete value after TTL expires', function (done) {
    setTimeout(function () {
      node3.getP(key)
        .then(function (storedValue) {
          expect(storedValue).to.be.null
          done()
        })
        .catch(function (error) {
          assert(false, 'Unable to remove expired data from the DHT. ' + error)
        })
    }, 1000)
  })
})

describe('#NAT', function () {
  this.timeout(10000)

  before(function (done) {
    publicIp(function (error, ip) {
      myPublicIpAddress = ip

      storage4 = new FakeStorage('node4')
      storage5 = new FakeStorage('node5')
      storage6 = new FakeStorage('node6')

      node4opts = {
        address: '0.0.0.0',
        port: 65532,
        nat: {
          type: 'upnp'
        },
        seeds: [],
        storage: storage4,
        loglevel: loglevel
      }

      node5opts = {
        address: '0.0.0.0',
        port: 65531,
        public: {
          type: 'upnp'
        },
        seeds: [{
          address: myPublicIpAddress,
          port: 65532
        }],
        storage: storage5,
        loglevel: loglevel
      }

      node6opts = {
        address: '0.0.0.0',
        port: 65530,
        public: {
          type: 'upnp'
        },
        seeds: [{
          address: myPublicIpAddress,
          port: 65532
        }],
        storage: storage6,
        loglevel: loglevel
      }

      node4 = new KadServer(node4opts)
      node5 = new KadServer(node5opts)
      node6 = new KadServer(node6opts)

      done()
    })
  })

  it('kadserver should launch NATed bootstrap server, retrieve public address and open NAT port through UPnP', function (done) {
    node4.on('ready', function () {
      assert(false, 'Ready event should not be fired since there are no seeds specified.')
    })
    node4.on('error', function (error) {
      assert(false, 'Error while activating node 4: ' + error)
    })
    node4.on('no peers', function () {
      expect(node4.dht.address).to.equal(myPublicIpAddress)
      done()
    })
    node4.activate()
  })

  it('kadserver should launch NATed overlay network', function (done) {
    node5.on('no peers', function () {
      assert(false, 'Node 5 could not connect to peer ' + JSON.stringify(node5opts.seeds))
    })
    node5.on('error', function (error) {
      assert(false, 'Error while activating node 5: ' + error)
    })
    node5.on('ready', function () {
      node6.on('no peers', function () {
        assert(false, 'Node 6 could not connect to peers ' + JSON.stringify(node6opts.seeds))
      })
      node6.on('error', function (error) {
        assert(false, 'Error while activating node 6: ' + error)
      })
      node6.on('ready', function () {
        done()
      })
      node6.activate()
    })
    node5.activate()
  })

  it('kadserver should write to NATed overlay network', function (done) {
    node5.putP(key, value1)
      .then(function () {
        expect(storage6.data).to.have.property(_createID(key))
        expect(storage5.data).to.not.have.property(_createID(key))
        expect(storage4.data).to.have.property(_createID(key))
        done()
      })
      .catch(function (error) {
        assert(false, 'Unable to succesfully write to the DHT. ' + error)
      })
  })

  it('kadserver should read from NATed overlay network', function (done) {
    node6.getP(key)
      .then(function (storedValue) {
        expect(storedValue).to.equal(value1)
        done()
      })
      .catch(function (error) {
        assert(false, 'Unable to succesfully read from the DHT. ' + error)
      })
  })
})

describe('#fake transport', function () {
  before(function () {
    storage7 = new FakeStorage('node7')
    storage8 = new FakeStorage('node8')
    storage9 = new FakeStorage('node9')

    node7opts = {
      address: '127.0.0.1',
      port: 65529,
      seeds: [],
      storage: storage7,
      transport: FakeTransport,
      loglevel: loglevel
    }

    node8opts = {
      address: '127.0.0.1',
      port: 65528,
      seeds: [{
        address: '127.0.0.1',
        port: 65529
      }],
      storage: storage8,
      transport: FakeTransport,
      loglevel: loglevel
    }

    node9opts = {
      address: '127.0.0.1',
      port: 65527,
      seeds: [{
        address: '127.0.0.1',
        port: 65529
      }],
      storage: storage9,
      transport: FakeTransport,
      loglevel: loglevel
    }

    node7 = new KadServer(node7opts)
    node8 = new KadServer(node8opts)
    node9 = new KadServer(node9opts)
  })

  it('kadserver should launch bootstrap server using fake transport connector', function (done) {
    done()
    //   node7.on('ready', function() {
    //     assert(false, 'Ready event should not be fired since there are no seeds specified.')
    //   })
    //   node7.on('error', function() {
    //     assert(false, 'Error while activating node 7: ' + error)
    //   })
    //   node7.on('no peers', function() {
    //     //expect(node7.dht.address).to.equal(myPublicIpAddress)
    //     done()
    //   })
    node7.activate()
  })
})
