module.exports={
 chooseShared:function(shareID,success,error){cordova.exec(success,error,'NearbyResolver','chooseShared',[shareID]);},
 resolve:function(url,success,error){cordova.exec(success,error,'NearbyResolver','resolve',[url]);},
 readShared:function(success,error,excluded){cordova.exec(success,error,'NearbyResolver','readShared',[excluded||[]]);},
 ackShared:function(shareID,success,error){cordova.exec(success,error,'NearbyResolver','ackShared',[shareID]);},
 syncCategories:function(categories,success,error){cordova.exec(success,error,'NearbyResolver','syncCategories',[categories]);}
};
