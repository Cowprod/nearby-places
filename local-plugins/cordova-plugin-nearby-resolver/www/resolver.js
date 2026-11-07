module.exports={
 resolve:function(url,success,error){cordova.exec(success,error,'NearbyResolver','resolve',[url]);},
 readShared:function(success,error){cordova.exec(success,error,'NearbyResolver','readShared',[]);},
 ackShared:function(shareID,success,error){cordova.exec(success,error,'NearbyResolver','ackShared',[shareID]);},
 syncCategories:function(categories,success,error){cordova.exec(success,error,'NearbyResolver','syncCategories',[categories]);}
};
