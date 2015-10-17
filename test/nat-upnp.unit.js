var ipAddresses = require('../src/ip-addresses')
var nat = require('../src/nat-upnp')
var publicIp = require('public-ip')
var winston = require('winston')

var chai = require('chai')
var chaiAsPromised = require('chai-as-promised')
var assert = chai.assert
var expect = chai.expect
chai.use(chaiAsPromised)
chai.should()

winston.level = 'debug'

var myPublicIpAddress

describe('#NAT', function () {
  this.timeout(10000)

  before(function (done) {
    ipAddresses.getPublicIpAddressP()
      .then(function (ip) {
        myPublicIpAddress = ip
        done()
      })
      .catch(function (error) {
        assert(false, 'Could not retrieve public address before running tests. ' + error)
      })
  })

  it('should return my public ip address', function () {
    return nat.getPublicGWAddressP().should.eventually.equal(myPublicIpAddress)
  })

  it('should map UDP port 65535 to 65535 and delete it afterwards', function () {
    var pmargs = {}
    pmargs.public = {}
    pmargs.public.port = 65535
    var myMapping
    return nat.mapPrivateToPublicPortP(pmargs)
      .then(function (args) {
        myMapping = args
        return nat.getPortMappingsP()
      })
      .then(function (currentMappings) {
        expect(_pmMatch(myMapping, currentMappings)).to.be.true
        return nat.unmapPrivateToPublicPortP(myMapping)
      })
      .then(function () {
        return nat.getPortMappingsP()
      })
      .then(function (currentMappings) {
        expect(_pmMatch(myMapping, currentMappings)).to.be.false
      })
  })

  it('should map TCP port 65534 to 65533, using custom description and ttl = 2 minutes, and delete it afterwards', function () {
    var pmargs = {}
    pmargs.public = {}
    pmargs.private = {}
    pmargs.private.port = 65534
    pmargs.public.port = 65533
    pmargs.protocol = 'TCP'
    pmargs.ttl = 120
    pmargs.description = 'funky:test'
    var myMapping
    return nat.mapPrivateToPublicPortP(pmargs)
      .then(function (args) {
        myMapping = args
        return nat.getPortMappingsP()
      })
      .then(function (currentMappings) {
        expect(_pmMatch(myMapping, currentMappings)).to.be.true
        return nat.unmapPrivateToPublicPortP(myMapping)
      })
      .then(function () {
        return nat.getPortMappingsP()
      })
      .then(function (currentMappings) {
        expect(_pmMatch(myMapping, currentMappings)).to.be.false
      })
  })
})

function _pmMatch (myMapping, returnedMappings) {
  var match = false
  returnedMappings.forEach(function (returnedMapping) {
    if (
      returnedMapping.public.port === myMapping.public.port &&
      returnedMapping.public.host === myMapping.public.host &&
      returnedMapping.private.port === myMapping.private.port &&
      returnedMapping.private.host === myMapping.private.host &&
      returnedMapping.ttl === myMapping.ttl &&
      returnedMapping.protocol.toLowerCase() === myMapping.protocol.toLowerCase() &&
      returnedMapping.description === myMapping.description
    ) {
      match = true
    }
  })
  return match
}