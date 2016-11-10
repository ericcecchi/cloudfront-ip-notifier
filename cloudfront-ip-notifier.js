const axios = require('axios');

module.exports = function (ctx, cb) {
  function arraysEqual(arr1, arr2) {
    if(arr1.length !== arr2.length)
        return false;
    for (var i = arr1.length; i--;) {
        if(arr1[i] !== arr2[i]) return false;
    }

    return true;
  }

  function filterCloudrontIps(prefix) {
    return prefix.service == 'CLOUDFRONT';
  }
  
  function getCloudfrontIps(list) {
    const ips = list.prefixes
      .filter(filterCloudrontIps)
      .map((prefix)=> prefix.ip_prefix);
    
    return ips;
  }
  
  function getCurrentIps() {
    return new Promise((resolve, reject)=> {
      ctx.storage.get(function (error, data) {
          if (error) return reject(error);
          resolve(data);
      });
    });
  }
  
  function getIncidentJson(ips) {
    return {    
      "service_key": ctx.secrets.PD_SERVICE_KEY,
      "event_type": "trigger",
      "description": "Cloudfront IP addresses changed.",
      "details": {
        "newIps": ips
      }
    };
  }
  
  function storeIps(data) {
      return new Promise((resolve, reject)=> {
        ctx.storage.set(data, function (error) {
            if (error) return reject(error);
            resolve(true);
        });
      });
  }
  
  function notifyPagerDuty(ips) {
    return axios
      .post('https://events.pagerduty.com/generic/2010-04-15/create_event.json', getIncidentJson(ips));
  }
  
  function checkIps() {
    return axios
      .get('https://ip-ranges.amazonaws.com/ip-ranges.json')
      .then((response)=> {
        const newIps = getCloudfrontIps(response.data);

        getCurrentIps()
          .then((currentIps)=> {
            if (arraysEqual(newIps, newIps)) {
              return cb(null, {
                message: 'Cloudfront IPs have not changed.'
              })
            } else {
              storeIps(newIps)
                .catch((error)=> cb(error));
              notifyPagerDuty(newIps)
                .then((response)=> cb(null, response.data))
                .catch((error)=> cb(error));
            }
          })
          .catch((error)=> cb(error))
        })
        .catch((error)=> cb(error));
  }
  
  checkIps();
}
