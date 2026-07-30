import {
  createContext,
  createElement,
  forwardRef,
  ReactNode,
  useContext,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";
import { Pressable, View } from "react-native";

type Region = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

type Coordinate = { latitude: number; longitude: number };

const fallbackRegion: Region = {
  latitude: 34.0522,
  longitude: -118.2437,
  latitudeDelta: 0.14,
  longitudeDelta: 0.14,
};

const MapRegionContext = createContext(fallbackRegion);

function openStreetMapUrl(region: Region) {
  const west = region.longitude - region.longitudeDelta / 2;
  const east = region.longitude + region.longitudeDelta / 2;
  const south = region.latitude - region.latitudeDelta / 2;
  const north = region.latitude + region.latitudeDelta / 2;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(`${west},${south},${east},${north}`)}&layer=mapnik`;
}

const WebMapView = forwardRef(function WebMapView(
  {
    style,
    children,
    initialRegion,
    region: controlledRegion,
  }: {
    style?: object;
    children?: ReactNode;
    initialRegion?: Region;
    region?: Region;
    [key: string]: unknown;
  },
  ref,
) {
  const [animatedRegion, setAnimatedRegion] = useState(initialRegion || fallbackRegion);
  const region = controlledRegion || animatedRegion;
  useImperativeHandle(ref, () => ({
    animateToRegion(next: Region) {
      setAnimatedRegion(next);
    },
  }));
  const source = useMemo(() => openStreetMapUrl(region), [region]);
  return (
    <MapRegionContext.Provider value={region}>
      <View style={[{ position: "relative", overflow: "hidden", backgroundColor: "#E9E4DC" }, style]}>
        {createElement("iframe", {
          src: source,
          title: "Area map",
          loading: "lazy",
          style: {
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            border: 0,
          },
        })}
        <View pointerEvents="box-none" style={{ position: "absolute", inset: 0 }}>
          {children}
        </View>
      </View>
    </MapRegionContext.Provider>
  );
});

export function Marker({
  coordinate,
  onPress,
  children,
}: {
  coordinate: Coordinate;
  onPress?: () => void;
  children?: ReactNode;
  title?: string;
  description?: string;
  [key: string]: unknown;
}) {
  const region = useContext(MapRegionContext);
  const left = 50 + ((coordinate.longitude - region.longitude) / Math.max(region.longitudeDelta, 0.001)) * 100;
  const top = 50 - ((coordinate.latitude - region.latitude) / Math.max(region.latitudeDelta, 0.001)) * 100;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={{
        position: "absolute",
        left: `${Math.max(3, Math.min(97, left))}%`,
        top: `${Math.max(3, Math.min(97, top))}%`,
        transform: [{ translateX: -24 }, { translateY: -24 }],
      }}
    >
      {children || <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: "#EF2D6F", borderWidth: 3, borderColor: "white" }} />}
    </Pressable>
  );
}

export default WebMapView;
