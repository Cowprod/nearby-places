module.exports={
 resolve:function(url,success,error){cordova.exec(success,error,'NearbyResolver','resolve',[url]);},
 readShared:function(success,error){cordova.exec(success,error,'NearbyResolver','readShared',[]);}
};
