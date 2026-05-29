import React, { useRef, useCallback, forwardRef, useImperativeHandle } from "react";
import { Platform, StyleSheet, View } from "react-native";
import WebView from "react-native-webview";
import { DriverData, UserCoords } from "@/types";

export interface CommuterLocation {
  commuterId: string;
  commuterName: string;
  lat: number;
  lng: number;
}

export interface MapWebViewRef {
  updateDriver: (data: DriverData) => void;
  removeDriver: (driverId: string) => void;
  setDrivers: (drivers: DriverData[]) => void;
  setUserLocation: (coords: UserCoords, panTo?: boolean) => void;
  panTo: (lat: number, lng: number, zoom?: number) => void;
  setCommuterLocations: (commuters: CommuterLocation[]) => void;
  updateCommuterLocation: (commuter: CommuterLocation) => void;
  removeCommuter: (commuterId: string) => void;
}

interface Props {
  style?: object;
  onMapReady?: () => void;
}

const MAP_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    * { margin:0;padding:0;box-sizing:border-box; }
    body { width:100%;height:100vh;overflow:hidden; }
    #map { width:100%;height:100vh; }
    .leaflet-control-attribution { font-size:10px; }
  </style>
</head>
<body>
<div id="map"></div>
<script>
  var map = L.map('map',{zoomControl:true}).setView([14.5995,120.9842],14);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
    attribution:'&copy; OpenStreetMap',maxZoom:19
  }).addTo(map);

  var markers={};
  var commuterMarkers={};
  var userMarker=null;
  var userCircle=null;

  function jIcon(status){
    var c=status==='available'?'#F97316':status==='full'?'#EF4444':'#9CA3AF';
    return L.divIcon({
      html:'<div style="background:'+c+';width:36px;height:36px;border-radius:50%;border:3px solid white;box-shadow:0 2px 10px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;"><svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M17 4H3C1.9 4 1 4.9 1 6v11h2c0 1.7 1.3 3 3 3s3-1.3 3-3h6c0 1.7 1.3 3 3 3s3-1.3 3-3h2v-5l-3-4h-3zm0 2h2.5l1.9 2.5H17V6zM6 17.5c-.8 0-1.5-.7-1.5-1.5s.7-1.5 1.5-1.5 1.5.7 1.5 1.5-.7 1.5-1.5 1.5zm12 0c-.8 0-1.5-.7-1.5-1.5s.7-1.5 1.5-1.5 1.5.7 1.5 1.5-.7 1.5-1.5 1.5z"/></svg></div>',
      iconSize:[36,36],iconAnchor:[18,18],className:''
    });
  }

  function cIcon(){
    return L.divIcon({
      html:'<div style="background:#8B5CF6;width:30px;height:30px;border-radius:50%;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;"><svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/></svg></div>',
      iconSize:[30,30],iconAnchor:[15,15],className:''
    });
  }

  function uIcon(){
    return L.divIcon({
      html:'<div style="background:#3B82F6;width:18px;height:18px;border-radius:50%;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,.3);"></div>',
      iconSize:[18,18],iconAnchor:[9,9],className:''
    });
  }

  function updateDriver(d){
    var lbl='<b>'+(d.driverName||'Driver')+'</b><br/>'+d.route+'<br/>Status: '+d.status+'<br/>Passengers: '+(d.passengerCount||0)+'<br/>Fare: \u20b1'+(d.totalFare||0);
    if(markers[d.driverId]){
      markers[d.driverId].setLatLng([d.lat,d.lng]);
      markers[d.driverId].setIcon(jIcon(d.status));
      markers[d.driverId].getPopup()&&markers[d.driverId].setPopupContent(lbl);
    } else {
      markers[d.driverId]=L.marker([d.lat,d.lng],{icon:jIcon(d.status)}).addTo(map).bindPopup(lbl);
    }
  }

  function removeDriver(id){ if(markers[id]){map.removeLayer(markers[id]);delete markers[id];} }

  function updateCommuter(c){
    var lbl='<b>'+(c.commuterName||'Passenger')+'</b><br/>Requesting ride';
    if(commuterMarkers[c.commuterId]){
      commuterMarkers[c.commuterId].setLatLng([c.lat,c.lng]);
    } else {
      commuterMarkers[c.commuterId]=L.marker([c.lat,c.lng],{icon:cIcon()}).addTo(map).bindPopup(lbl);
    }
  }

  function removeCommuter(id){ if(commuterMarkers[id]){map.removeLayer(commuterMarkers[id]);delete commuterMarkers[id];} }

  function setUserLoc(lat,lng,pan){
    if(userMarker){userMarker.setLatLng([lat,lng]);userCircle.setLatLng([lat,lng]);}
    else{
      userMarker=L.marker([lat,lng],{icon:uIcon()}).addTo(map).bindPopup('You');
      userCircle=L.circle([lat,lng],{radius:50,color:'#3B82F6',fillOpacity:.15,weight:2}).addTo(map);
    }
    if(pan) map.setView([lat,lng],16);
  }

  function handleMsg(e){
    try{
      var msg=JSON.parse(typeof e.data==='string'?e.data:JSON.stringify(e.data));
      if(msg.type==='UPDATE_DRIVER') updateDriver(msg.data);
      else if(msg.type==='REMOVE_DRIVER') removeDriver(msg.driverId);
      else if(msg.type==='SET_DRIVERS') msg.drivers.forEach(updateDriver);
      else if(msg.type==='USER_LOCATION') setUserLoc(msg.lat,msg.lng,msg.panTo);
      else if(msg.type==='PAN_TO') map.setView([msg.lat,msg.lng],msg.zoom||15);
      else if(msg.type==='SET_COMMUTERS') msg.commuters.forEach(updateCommuter);
      else if(msg.type==='UPDATE_COMMUTER') updateCommuter(msg.data);
      else if(msg.type==='REMOVE_COMMUTER') removeCommuter(msg.commuterId);
    }catch(err){}
  }

  document.addEventListener('message',handleMsg);
  window.addEventListener('message',handleMsg);

  map.on('load',function(){
    window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify({type:'MAP_READY'}));
  });

  setTimeout(function(){
    window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify({type:'MAP_READY'}));
  },500);
</script>
</body>
</html>`;

const MapWebView = forwardRef<MapWebViewRef, Props>(({ style, onMapReady }, ref) => {
  const webViewRef = useRef<WebView>(null);

  const inject = useCallback((script: string) => {
    webViewRef.current?.injectJavaScript(script + ";true;");
  }, []);

  useImperativeHandle(ref, () => ({
    updateDriver(data: DriverData) {
      inject(`handleMsg({data:JSON.stringify({type:'UPDATE_DRIVER',data:${JSON.stringify(data)}})})`);
    },
    removeDriver(driverId: string) {
      inject(`handleMsg({data:JSON.stringify({type:'REMOVE_DRIVER',driverId:'${driverId}'})})`);
    },
    setDrivers(drivers: DriverData[]) {
      inject(`handleMsg({data:JSON.stringify({type:'SET_DRIVERS',drivers:${JSON.stringify(drivers)}})})`);
    },
    setUserLocation(coords: UserCoords, panTo = false) {
      inject(`handleMsg({data:JSON.stringify({type:'USER_LOCATION',lat:${coords.lat},lng:${coords.lng},panTo:${panTo}})})`);
    },
    panTo(lat: number, lng: number, zoom = 15) {
      inject(`handleMsg({data:JSON.stringify({type:'PAN_TO',lat:${lat},lng:${lng},zoom:${zoom}})})`);
    },
    setCommuterLocations(commuters: CommuterLocation[]) {
      inject(`handleMsg({data:JSON.stringify({type:'SET_COMMUTERS',commuters:${JSON.stringify(commuters)}})})`);
    },
    updateCommuterLocation(commuter: CommuterLocation) {
      inject(`handleMsg({data:JSON.stringify({type:'UPDATE_COMMUTER',data:${JSON.stringify(commuter)}})})`);
    },
    removeCommuter(commuterId: string) {
      inject(`handleMsg({data:JSON.stringify({type:'REMOVE_COMMUTER',commuterId:'${commuterId}'})})`);
    },
  }));

  function onMessage(e: { nativeEvent: { data: string } }) {
    try {
      const msg = JSON.parse(e.nativeEvent.data);
      if (msg.type === "MAP_READY") onMapReady?.();
    } catch {}
  }

  if (Platform.OS === "web") {
    return (
      <View style={[styles.container, style]}>
        <iframe
          srcDoc={MAP_HTML}
          style={{ width: "100%", height: "100%", border: "none" }}
          sandbox="allow-scripts allow-same-origin"
        />
      </View>
    );
  }

  return (
    <WebView
      ref={webViewRef}
      source={{ html: MAP_HTML }}
      style={[styles.container, style]}
      onMessage={onMessage}
      javaScriptEnabled
      domStorageEnabled
      scrollEnabled={false}
      bounces={false}
      allowsInlineMediaPlayback
      originWhitelist={["*"]}
    />
  );
});

MapWebView.displayName = "MapWebView";
export default MapWebView;

const styles = StyleSheet.create({
  container: { flex: 1 },
});
