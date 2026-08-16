import React, { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import './TomTomMap.css';
import AISuggestionPopup from './AISuggestionPopup';

const TOMTOM_API_KEY = (process.env.REACT_APP_TOMTOM_API_KEY || '').trim();
const HAS_TOMTOM_KEY = Boolean(TOMTOM_API_KEY);

const createMapStyle = () => {
  if (HAS_TOMTOM_KEY) {
    return {
      version: 8,
      sources: {
        tomtom: {
          type: 'raster',
          tiles: [`https://api.tomtom.com/map/1/tile/basic/main/{z}/{x}/{y}.png?key=${TOMTOM_API_KEY}`],
          tileSize: 256,
          attribution: '© TomTom',
        },
      },
      layers: [{ id: 'tomtom-tiles', type: 'raster', source: 'tomtom', minzoom: 0, maxzoom: 22 }],
    };
  }

  return {
    version: 8,
    sources: {
      osm: {
        type: 'raster',
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution: '© OpenStreetMap contributors',
      },
    },
    layers: [{ id: 'osm-tiles', type: 'raster', source: 'osm', minzoom: 0, maxzoom: 22 }],
  };
};

const TomTomMap = () => {
  const [pickIndex, setPickIndex] = useState(null);
  const mapContainer = useRef(null);
  const mapInstance = useRef(null);
  const [search, setSearch] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [isFocused, setIsFocused] = useState(false);
  const [mapStatus, setMapStatus] = useState('');
  
  // Route planner panel state
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [routeInputs, setRouteInputs] = useState([
    { value: '', suggestions: [], coords: null },
    { value: '', suggestions: [], coords: null },
  ]);
  const [mode, setMode] = useState('car');
  const [isEnterpriseMode, setIsEnterpriseMode] = useState(false);
  const [truckSpecs, setTruckSpecs] = useState({
    weight: '15000',
    height: '4.0',
    width: '2.5',
    length: '12.0'
  });
  const [fuelCapacity, setFuelCapacity] = useState('');
  const [mileage, setMileage] = useState('');
  const [currentFuel, setCurrentFuel] = useState('');
  
  // Simulation state
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationProgress, setSimulationProgress] = useState(0);
  const simulationMarkerRef = useRef(null);
  const simulationIntervalRef = useRef(null);
  
  // AI Suggestion state
  const [showAISuggestion, setShowAISuggestion] = useState(false);
  
  // Vehicle tracking state
  const [vehicleLocation, setVehicleLocation] = useState(null);
  const [showVehiclePopup, setShowVehiclePopup] = useState(false);
  const vehicleMarkerRef = useRef(null);
  const vehicleDataIntervalRef = useRef(null);
  
  // Other existing state
  const [userLocation, setUserLocation] = useState(null);
  const [points, setPoints] = useState([]);
  const [routeGeoJson, setRouteGeoJson] = useState(null);
  const [showUserArrow, setShowUserArrow] = useState(false);
  const [showTraffic, setShowTraffic] = useState(false);
  const [routeInstructions, setRouteInstructions] = useState([]);
  const [routeSummary, setRouteSummary] = useState(null);
  
  // New state for route alternatives display
  const [alternativeRoutes, setAlternativeRoutes] = useState([]);
  const [showRouteOptions, setShowRouteOptions] = useState(false);

  // Function to create or update the vehicle's marker on the map
  const updateVehicleMarker = useCallback((newVehicleData) => {
    if (!mapInstance.current) return;

    if (!vehicleMarkerRef.current) {
      const vehicleEl = document.createElement('div');
      vehicleEl.className = 'vehicle-marker';
      vehicleEl.innerHTML = '🚗';

      vehicleMarkerRef.current = new maplibregl.Marker({
        element: vehicleEl,
        anchor: 'center'
      })
      .setLngLat([newVehicleData.lon, newVehicleData.lat])
      .addTo(mapInstance.current);
    } else {
      vehicleMarkerRef.current.setLngLat([newVehicleData.lon, newVehicleData.lat]);
    }
  }, []);

  // Function to handle showing the vehicle's location pop-up
  const handleShowVehicleLocation = () => {
    if (vehicleLocation) {
      setShowVehiclePopup(true);
      setTimeout(() => {
        setShowVehiclePopup(false);
      }, 3000);
    }
  };

  // Cleanup function for markers
  const cleanupMarkers = () => {
    if (mapInstance.current && mapInstance.current._pointMarkers) {
      mapInstance.current._pointMarkers.forEach(m => m.remove());
      mapInstance.current._pointMarkers = [];
    }
  };

  // Cleanup function for simulation
  const cleanupSimulation = () => {
    if (simulationIntervalRef.current) {
      clearInterval(simulationIntervalRef.current);
      simulationIntervalRef.current = null;
    }
    if (vehicleDataIntervalRef.current) {
      clearInterval(vehicleDataIntervalRef.current);
      vehicleDataIntervalRef.current = null;
    }
    if (simulationMarkerRef.current) {
      simulationMarkerRef.current.remove();
      simulationMarkerRef.current = null;
    }
    if (vehicleMarkerRef.current) {
      vehicleMarkerRef.current.remove();
      vehicleMarkerRef.current = null;
    }
    setIsSimulating(false);
    setSimulationProgress(0);
    setVehicleLocation(null);
    setShowVehiclePopup(false);
  };

  // Cleanup function for all routes
  const cleanupAllRoutes = () => {
    if (mapInstance.current) {
      // Remove main route
      if (mapInstance.current.getSource('route')) {
        mapInstance.current.removeLayer('route');
        mapInstance.current.removeSource('route');
      }
      // Remove alternate routes
      for (let i = 0; i < 3; i++) {
        const routeId = `route-${i}`;
        if (mapInstance.current.getSource(routeId)) {
          mapInstance.current.removeLayer(routeId);
          mapInstance.current.removeSource(routeId);
        }
      }
    }
  };

  // Autocomplete for route planner fields
  const handleRouteInputChange = async (idx, value) => {
    setRouteInputs((prev) => prev.map((f, i) => i === idx ? { ...f, value, coords: null } : f));
    if (value.length < 3) {
      setRouteInputs((prev) => prev.map((f, i) => i === idx ? { ...f, suggestions: [] } : f));
      return;
    }
    try {
      const endpoint = `https://api.tomtom.com/search/2/search/${encodeURIComponent(value)}.json?key=${TOMTOM_API_KEY}&limit=5&typeahead=true`;
      const res = await fetch(endpoint);
      const data = await res.json();
      setRouteInputs((prev) => prev.map((f, i) => i === idx ? { ...f, suggestions: data.results || [] } : f));
    } catch (error) {
      console.error('Autocomplete error:', error);
      setRouteInputs((prev) => prev.map((f, i) => i === idx ? { ...f, suggestions: [] } : f));
    }
  };

  const handlePickClick = (idx) => {
    console.log('Pick clicked for index:', idx);
    setPickIndex(idx);
  };

  const handleRouteSuggestionClick = (idx, suggestion) => {
    setRouteInputs((prev) => prev.map((f, i) => i === idx ? {
      ...f,
      value: suggestion.address.freeformAddress,
      coords: [suggestion.position.lon, suggestion.position.lat],
      suggestions: [],
    } : f));
  };

  const handleAddDestination = () => {
    setRouteInputs((prev) => [...prev, { value: '', suggestions: [], coords: null }]);
  };

  const handleRemoveDestination = (idx) => {
    if (routeInputs.length <= 2) return;
    setRouteInputs((prev) => prev.filter((_, i) => i !== idx));
  };

  useEffect(() => {
    if (!mapContainer.current || mapInstance.current) {
      return;
    }

    let defaultCenter = [77.5946, 12.9716]; // Bangalore
    
    const initializeMap = (center) => {
      const map = new maplibregl.Map({
        container: mapContainer.current,
        style: createMapStyle(),
        center,
        zoom: 10,
      });

      map.on('load', () => {
        if (!HAS_TOMTOM_KEY) {
          setMapStatus('TomTom key missing — showing OpenStreetMap fallback.');
        } else {
          setMapStatus('');
        }
      });

      map.on('error', (e) => {
        console.error('MapLibre error:', e);
        setMapStatus('Map could not load the tile layer.');
      });

      map._pointMarkers = [];
      mapInstance.current = map;
    };

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const userCenter = [position.coords.longitude, position.coords.latitude];
          setUserLocation(userCenter);
          initializeMap(userCenter);
        },
        (error) => {
          console.warn('Geolocation error:', error);
          initializeMap(defaultCenter);
        }
      );
    } else {
      initializeMap(defaultCenter);
    }

    // Cleanup on unmount
    return () => {
      cleanupSimulation();
      cleanupMarkers();
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
      setSuggestions([]);
    };
  }, []);

  // Separate useEffect for map click handler to properly handle pickIndex changes
  useEffect(() => {
    if (!mapInstance.current) return;

    const handleMapClick = async (e) => {
      if (pickIndex !== null) {
        const idx = pickIndex;
        const lngLat = [e.lngLat.lng, e.lngLat.lat];
        
        // Reverse geocode to get address
        try {
          const endpoint = `https://api.tomtom.com/search/2/reverseGeocode/${lngLat[1]},${lngLat[0]}.json?key=${TOMTOM_API_KEY}`;
          const res = await fetch(endpoint);
          const data = await res.json();
          let address = `${lngLat[1].toFixed(6)}, ${lngLat[0].toFixed(6)}`;
          if (data.addresses && data.addresses[0] && data.addresses[0].address && data.addresses[0].address.freeformAddress) {
            address = data.addresses[0].address.freeformAddress;
          }
          setRouteInputs((prev) => prev.map((f, i) => i === idx ? { ...f, coords: lngLat, value: address, suggestions: [] } : f));
        } catch (error) {
          console.error('Reverse geocoding error:', error);
          setRouteInputs((prev) => prev.map((f, i) => i === idx ? { ...f, coords: lngLat, value: `${lngLat[1].toFixed(6)}, ${lngLat[0].toFixed(6)}`, suggestions: [] } : f));
        }
        setPickIndex(null);
      }
    };

    mapInstance.current.on('click', handleMapClick);

    // Cleanup click handler
    return () => {
      if (mapInstance.current) {
        mapInstance.current.off('click', handleMapClick);
      }
    };
  }, [pickIndex]);

  // TomTom Autocomplete API
  const handleSearchChange = async (e) => {
    const value = e.target.value;
    setSearch(value);
    if (value.length < 3) {
      setSuggestions([]);
      return;
    }
    try {
      const endpoint = `https://api.tomtom.com/search/2/search/${encodeURIComponent(value)}.json?key=${TOMTOM_API_KEY}&limit=5&typeahead=true`;
      const res = await fetch(endpoint);
      const data = await res.json();
      setSuggestions(data.results || []);
    } catch (error) {
      console.error('Search autocomplete error:', error);
      setSuggestions([]);
    }
  };

  const handleSuggestionClick = (suggestion) => {
    setSearch(suggestion.address.freeformAddress);
    setSuggestions([]);
    if (mapInstance.current && suggestion.position) {
      mapInstance.current.flyTo({
        center: [suggestion.position.lon, suggestion.position.lat],
        zoom: 14,
        essential: true,
      });
    }
  };

  // Route simulation function - Shows AI suggestion popup
  const simulateRoute = () => {
    if (!routeGeoJson || !routeGeoJson.geometry || !routeGeoJson.geometry.coordinates) {
      alert('Please calculate a route first');
      return;
    }

    if (isSimulating) {
      // Stop simulation
      cleanupSimulation();
      return;
    }

    // Show AI suggestion popup when starting simulation
    setShowAISuggestion(true);

    // Start simulation
    setIsSimulating(true);
    setSimulationProgress(0);

    const coordinates = routeGeoJson.geometry.coordinates;
    if (coordinates.length === 0) return;

    // Initialize vehicle location with first coordinate
    const initialVehicleData = {
      lon: coordinates[0][0],
      lat: coordinates[0][1],
      address: 'Start of Route',
      timestamp: new Date(),
    };
    setVehicleLocation(initialVehicleData);
    updateVehicleMarker(initialVehicleData);

    // Create vehicle marker element
    const vehicleEl = document.createElement('div');
    vehicleEl.style.width = '30px';
    vehicleEl.style.height = '30px';
    vehicleEl.style.backgroundImage = isEnterpriseMode 
      ? 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' fill=\'%2328a745\'%3E%3Cpath d=\'M20 8h-3V4H3c-1.1 0-2 .9-2 2v11h2c0 1.66 1.34 3 3 3s3-1.34 3-3h6c0 1.66 1.34 3 3 3s3-1.34 3-3h2v-5l-3-4zM6 18.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm13.5-9l1.96 2.5H17V9.5h2.5zm-1.5 9c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z\'/%3E%3C/svg%3E")'
      : 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' fill=\'%230078d7\'%3E%3Cpath d=\'M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.22.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z\'/%3E%3C/svg%3E")';
    vehicleEl.style.backgroundSize = 'contain';
    vehicleEl.style.backgroundRepeat = 'no-repeat';
    vehicleEl.style.backgroundPosition = 'center';
    vehicleEl.style.borderRadius = '50%';
    vehicleEl.style.backgroundColor = 'white';
    vehicleEl.style.border = '2px solid #333';
    vehicleEl.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3)';

    // Create marker
    simulationMarkerRef.current = new maplibregl.Marker({
      element: vehicleEl,
      anchor: 'center'
    })
    .setLngLat(coordinates[0])
    .addTo(mapInstance.current);

    let currentIndex = 0;
    const totalSteps = coordinates.length;
    const stepDuration = Math.max(50, 3000 / totalSteps); // Adjust speed based on route length

    simulationIntervalRef.current = setInterval(() => {
      if (currentIndex >= coordinates.length - 1) {
        // Animation complete
        setIsSimulating(false);
        setSimulationProgress(100);
        clearInterval(simulationIntervalRef.current);
        simulationIntervalRef.current = null;
        
        // Keep marker visible for 2 seconds then remove
        setTimeout(() => {
          if (simulationMarkerRef.current) {
            simulationMarkerRef.current.remove();
            simulationMarkerRef.current = null;
          }
          if (vehicleMarkerRef.current) {
            vehicleMarkerRef.current.remove();
            vehicleMarkerRef.current = null;
          }
          setSimulationProgress(0);
          setVehicleLocation(null);
        }, 2000);
        return;
      }

      currentIndex++;
      const progress = Math.round((currentIndex / (totalSteps - 1)) * 100);
      setSimulationProgress(progress);

      // Update vehicle location data
      const newVehicleData = {
        lon: coordinates[currentIndex][0],
        lat: coordinates[currentIndex][1],
        address: `On Route Segment ${currentIndex} - Lat: ${coordinates[currentIndex][1].toFixed(4)}, Lon: ${coordinates[currentIndex][0].toFixed(4)}`,
        timestamp: new Date(),
      };
      setVehicleLocation(newVehicleData);
      updateVehicleMarker(newVehicleData);

      // Move marker to next position
      if (simulationMarkerRef.current) {
        simulationMarkerRef.current.setLngLat(coordinates[currentIndex]);
      }

      // Auto-follow the vehicle
      if (mapInstance.current && currentIndex % 5 === 0) {
        mapInstance.current.easeTo({
          center: coordinates[currentIndex],
          duration: stepDuration
        });
      }
    }, stepDuration);
  };

  // Recenter to user location
  const handleRecenter = () => {
    if (userLocation && mapInstance.current) {
      mapInstance.current.flyTo({ center: userLocation, zoom: 14, essential: true });
      setShowUserArrow(true);
      setTimeout(() => setShowUserArrow(false), 3000);
    }
  };

  // Draw points, route, and traffic
  useEffect(() => {
    if (!mapInstance.current) return;
    
    // Remove old markers
    cleanupMarkers();
    mapInstance.current._pointMarkers = [];
    
    points.forEach((lngLat, idx) => {
      const marker = new maplibregl.Marker({ color: idx === 0 ? 'green' : 'blue' })
        .setLngLat(lngLat)
        .addTo(mapInstance.current);
      mapInstance.current._pointMarkers.push(marker);
    });
    
    // Add blue dot at user location if requested
    if (showUserArrow && userLocation) {
      const el = document.createElement('div');
      el.className = 'user-location-marker';
      const dotMarker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat(userLocation)
        .addTo(mapInstance.current);
      mapInstance.current._pointMarkers.push(dotMarker);
    }
    
    // Draw route if available
    if (routeGeoJson) {
      if (mapInstance.current.getSource('route')) {
        mapInstance.current.removeLayer('route');
        mapInstance.current.removeSource('route');
      }
      mapInstance.current.addSource('route', {
        type: 'geojson',
        data: routeGeoJson,
      });
      mapInstance.current.addLayer({
        id: 'route',
        type: 'line',
        source: 'route',
        paint: {
          'line-color': '#ff6600',
          'line-width': 4,
        },
      });
    } else {
      // Remove route layer if routeGeoJson is null
      if (mapInstance.current && mapInstance.current.getSource('route')) {
        mapInstance.current.removeLayer('route');
        mapInstance.current.removeSource('route');
      }
    }
    
    // Traffic Layer
    if (showTraffic && mapInstance.current.getZoom() >= 12) {
      if (!mapInstance.current.getSource('traffic')) {
        mapInstance.current.addSource('traffic', {
          type: 'raster',
          tiles: [
            `https://api.tomtom.com/traffic/map/4/tile/flow/relative0/{z}/{x}/{y}.png?key=${TOMTOM_API_KEY}`
          ],
          tileSize: 256,
          attribution: '© TomTom Traffic',
        });
        mapInstance.current.addLayer({
          id: 'traffic',
          type: 'raster',
          source: 'traffic',
          minzoom: 0,
          maxzoom: 22,
          paint: { 'raster-opacity': 0.7 },
        });
      }
    } else {
      if (mapInstance.current.getLayer('traffic')) {
        mapInstance.current.removeLayer('traffic');
      }
      if (mapInstance.current.getSource('traffic')) {
        mapInstance.current.removeSource('traffic');
      }
    }
  }, [points, routeGeoJson, showUserArrow, userLocation, showTraffic]);

  // Calculate route with fuel stops for car/truck
  const calculateRouteWithFuelStops = async (coords) => {
    const maxDistance = parseFloat(mileage) * parseFloat(currentFuel);
    let currentWaypoints = [coords[0]];
    let remaining = coords.slice(1);
    let fuelStops = [];
    
    while (remaining.length > 0) {
      const testWaypoints = [...currentWaypoints, ...remaining];
      const locations = testWaypoints.map(p => `${p[1]},${p[0]}`).join(':');
      const url = `https://api.tomtom.com/routing/1/calculateRoute/${locations}/json?key=${TOMTOM_API_KEY}&routeType=fastest&travelMode=${mode}&traffic=false`;

      try {
        const res = await fetch(url);
        const data = await res.json();
        
        if (!(data.routes && data.routes[0] && data.routes[0].legs)) {
          throw new Error('No route found');
        }
        
        let traveled = 0;
        let needStop = false;
        let fuelStopCoord = null;
        
        // Calculate distance along route
        for (let legIdx = 0; legIdx < data.routes[0].legs.length; legIdx++) {
          const leg = data.routes[0].legs[legIdx];
          for (let i = 1; i < leg.points.length; i++) {
            const prev = leg.points[i - 1];
            const curr = leg.points[i];
            const dx = curr.latitude - prev.latitude;
            const dy = curr.longitude - prev.longitude;
            const dist = Math.sqrt(dx * dx + dy * dy) * 111;
            traveled += dist;
            
            if (traveled >= maxDistance && remaining.length > 0) {
              fuelStopCoord = [curr.longitude, curr.latitude];
              needStop = true;
              break;
            }
          }
          if (needStop) break;
        }
        
        if (needStop && fuelStopCoord) {
          const fuelUrl = `https://api.tomtom.com/search/2/poiSearch/fuel.json?lat=${fuelStopCoord[1]}&lon=${fuelStopCoord[0]}&radius=10000&key=${TOMTOM_API_KEY}&limit=1`;
          const fuelRes = await fetch(fuelUrl);
          const fuelData = await fuelRes.json();
          
          if (fuelData.results && fuelData.results[0] && fuelData.results[0].position) {
            const fuelStation = [fuelData.results[0].position.lon, fuelData.results[0].position.lat];
            currentWaypoints.push(fuelStation);
            fuelStops.push(fuelStation);
            continue;
          } else {
            break;
          }
        } else {
          break;
        }
      } catch (error) {
        console.error('Route calculation error:', error);
        throw error;
      }
    }
    
    return [...currentWaypoints, ...remaining];
  };

  // Main route calculation function
  const handlePlannerRoute = async () => {
    const coords = routeInputs.map(f => f.coords).filter(Boolean);
    if (coords.length < 2) return;
    
    setRouteInstructions([]);
    setRouteSummary(null);
    setRouteGeoJson(null);
    setAlternativeRoutes([]);
    setShowRouteOptions(false);
    
    try {
      let finalWaypoints = coords;
      
      // Apply fuel logic for car/truck if fuel parameters are provided
      if (!isEnterpriseMode && (mode === 'car' || mode === 'truck') && fuelCapacity && mileage && currentFuel) {
        finalWaypoints = await calculateRouteWithFuelStops(coords);
      }
      
      // Enterprise Mode: Optimized routing for commercial delivery
      if (isEnterpriseMode) {
        const locations = finalWaypoints.map(p => `${p[1]},${p[0]}`).join(':');
        const url = `https://api.tomtom.com/routing/1/calculateRoute/${locations}/json?key=${TOMTOM_API_KEY}&computeBestOrder=true&routeType=shortest&travelMode=truck&traffic=true&vehicleCommercial=true`;
        
        const res = await fetch(url);
        const data = await res.json();
        
        if (data.routes && data.routes[0] && data.routes[0].legs) {
          const pointsArr = data.routes[0].legs.flatMap(leg => 
            leg.points.map(pt => [pt.longitude, pt.latitude])
          );
          
          setRouteGeoJson({
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: pointsArr },
          });
          
          // Use optimized order if available
          const optimizedWaypoints = data.routes[0].optimizedWaypoints || finalWaypoints;
          setPoints(optimizedWaypoints);
          setPlannerOpen(false);
          
          // Extract route summary for enterprise
          if (data.routes[0].summary) {
            const distanceKm = data.routes[0].summary.lengthInMeters / 1000;
            const timeSeconds = data.routes[0].summary.travelTimeInSeconds;
            const hours = Math.floor(timeSeconds / 3600);
            const minutes = Math.floor((timeSeconds % 3600) / 60);
            setRouteSummary({
              distance: distanceKm.toFixed(1) + ' km',
              time: hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`,
              isEnterprise: true,
              truckSpecs: truckSpecs
            });
          }
          
          // Collect enterprise instructions with delivery order
          const instructions = [];
          data.routes[0].legs.forEach((leg, legIdx) => {
            instructions.push({ 
              street: 'Delivery Stop', 
              message: `Stop ${legIdx + 1}: Delivery point ${legIdx === 0 ? '(Start)' : legIdx}`
            });
            if (leg.instructions) {
              leg.instructions.forEach(instr => {
                instructions.push({
                  street: instr.roadNumbers && instr.roadNumbers.length ? instr.roadNumbers.join(', ') : instr.street || '',
                  message: instr.message || '',
                });
              });
            }
          });
          setRouteInstructions(instructions);
        } else {
          throw new Error('No enterprise route found');
        }
      } else {
        // Standard routing with alternate routes
        const locations = finalWaypoints.map(p => `${p[1]},${p[0]}`).join(':');
        const url = `https://api.tomtom.com/routing/1/calculateRoute/${locations}/json?key=${TOMTOM_API_KEY}&routeType=fastest&travelMode=${mode}&traffic=false&maxAlternatives=2`;
        
        const res = await fetch(url);
        const data = await res.json();
        
        if (data.routes && data.routes.length > 0) {
          // Process all routes for display
          const processedRoutes = [];
          
          data.routes.forEach((route, index) => {
            const pointsArr = route.legs.flatMap(leg =>
              leg.points.map(pt => [pt.longitude, pt.latitude])
            );
            
            const routeGeoJson = {
              type: 'Feature',
              geometry: { type: 'LineString', coordinates: pointsArr },
            };

            const routeId = `route-${index}`;
            
            // Calculate route summary
            const distanceKm = route.summary.lengthInMeters / 1000;
            const timeSeconds = route.summary.travelTimeInSeconds;
            const hours = Math.floor(timeSeconds / 3600);
            const minutes = Math.floor((timeSeconds % 3600) / 60);
            
            const routeInfo = {
              id: routeId,
              geoJson: routeGeoJson,
              distance: distanceKm.toFixed(1) + ' km',
              time: hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`,
              isOptimized: index === 0,
              color: index === 0 ? '#ff6600' : index === 1 ? '#0078d7' : '#28a745',
              name: index === 0 ? 'Optimized Route' : `Alternative ${index}`
            };
            
            processedRoutes.push(routeInfo);
            
            // Remove existing route layer if it exists
            if (mapInstance.current.getSource(routeId)) {
              mapInstance.current.removeLayer(routeId);
              mapInstance.current.removeSource(routeId);
            }

            mapInstance.current.addSource(routeId, { 
              type: 'geojson', 
              data: routeGeoJson 
            });
            
            mapInstance.current.addLayer({
              id: routeId,
              type: 'line',
              source: routeId,
              paint: {
                'line-color': routeInfo.color,
                'line-width': index === 0 ? 6 : 4,
                'line-opacity': index === 0 ? 1 : 0.7,
              },
            });
            
            // Store the main route for simulation
            if (index === 0) {
              setRouteGeoJson(routeGeoJson);
            }
          });
          
          setAlternativeRoutes(processedRoutes);
          setShowRouteOptions(true);
          setPoints(finalWaypoints);
          setPlannerOpen(false);
          
          // Extract route summary from main route (first one)
          if (data.routes[0].summary) {
            const distanceKm = data.routes[0].summary.lengthInMeters / 1000;
            const timeSeconds = data.routes[0].summary.travelTimeInSeconds;
            const hours = Math.floor(timeSeconds / 3600);
            const minutes = Math.floor((timeSeconds % 3600) / 60);
            setRouteSummary({
              distance: distanceKm.toFixed(1) + ' km',
              time: hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`,
              alternativeCount: data.routes.length - 1,
              isOptimized: true
            });
          }
          
          // Collect instructions from main route
          const instructions = [];
          data.routes[0].legs.forEach((leg) => {
            if (leg.instructions) {
              leg.instructions.forEach(instr => {
                instructions.push({
                  street: instr.roadNumbers && instr.roadNumbers.length ? instr.roadNumbers.join(', ') : instr.street || '',
                  message: instr.message || '',
                });
              });
            }
          });
          setRouteInstructions(instructions);
        } else {
          throw new Error('No route found');
        }
      }
    } catch (error) {
      console.error('Route planning error:', error);
      alert('Failed to calculate route. Please check your destinations and try again.');
      setRouteGeoJson(null);
      setRouteSummary(null);
      setRouteInstructions([]);
      setAlternativeRoutes([]);
      setShowRouteOptions(false);
    }
  };

  // Toggle route visibility
  const toggleRouteVisibility = (routeId, isVisible) => {
    if (mapInstance.current && mapInstance.current.getLayer(routeId)) {
      mapInstance.current.setLayoutProperty(routeId, 'visibility', isVisible ? 'visible' : 'none');
    }
  };

  return (
    <div className="map-container">
      {/* AI Suggestion Popup */}
      <AISuggestionPopup
        isVisible={showAISuggestion}
        onClose={() => setShowAISuggestion(false)}
        routeSummary={routeSummary}
        destinationCount={routeInputs.filter(input => input.coords).length}
        isEnterpriseMode={isEnterpriseMode}
        truckSpecs={truckSpecs}
      />

      {/* Route Options Panel */}
      {showRouteOptions && alternativeRoutes.length > 0 && (
        <div className="route-options-panel">
          <div className="route-options-header">
            <h3>Route Options</h3>
            <button 
              onClick={() => setShowRouteOptions(false)}
              className="close-route-options"
              title="Hide route options"
            >
              ×
            </button>
          </div>
          <div className="route-options-list">
            {alternativeRoutes.map((route, index) => (
              <div key={route.id} className={`route-option ${route.isOptimized ? 'optimized' : 'alternative'}`}>
                <div className="route-option-header">
                  <div className="route-indicator">
                    <div 
                      className="route-color-dot" 
                      style={{ backgroundColor: route.color }}
                    ></div>
                    <span className={`route-name ${route.isOptimized ? 'optimized-text' : 'alternative-text'}`}>
                      {route.isOptimized ? 'Optimized Route' : `${route.name}`}
                    </span>
                  </div>
                  <label className="route-visibility-toggle">
                    <input 
                      type="checkbox" 
                      defaultChecked={true}
                      onChange={(e) => toggleRouteVisibility(route.id, e.target.checked)}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
                <div className="route-stats">
                  <span className="route-distance">{route.distance}</span>
                  <span className="route-time">{route.time}</span>
                  {route.isOptimized && (
                    <span className="optimized-badge">FASTEST</span>
                  )}
                </div>
                {!route.isOptimized && (
                  <div className="alternative-note">
                    Alternative path - may take longer
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="route-legend">
            <div className="legend-item">
              <div className="legend-dot" style={{ backgroundColor: '#ff6600' }}></div>
              <span>Optimized (Fastest route)</span>
            </div>
            <div className="legend-item">
              <div className="legend-dot" style={{ backgroundColor: '#0078d7' }}></div>
              <span>Alternative route</span>
            </div>
            {alternativeRoutes.length > 2 && (
              <div className="legend-item">
                <div className="legend-dot" style={{ backgroundColor: '#28a745' }}></div>
                <span>Alternative route</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Route Instructions at Bottom */}
      {routeInstructions.length > 0 && (
        <div className="route-instructions-panel">
          <div className="instructions-title">
            {routeSummary?.isOptimized && (
              <span className="optimized-indicator">★ </span>
            )}
            Route Instructions
            {routeSummary?.isOptimized && (
              <span className="optimized-label">(Optimized Path)</span>
            )}
          </div>
          <ol className="instructions-list">
            {routeInstructions.map((step, i) => (
              <li key={i} className="instruction-step">
                <span className="instruction-street">{step.street ? `${step.street}: ` : ''}</span>
                {step.message}
              </li>
            ))}
          </ol>
        </div>
      )}
      
      {mapStatus && (
        <div className="map-status-banner">{mapStatus}</div>
      )}

      {/* Route Summary at Bottom Left */}
      {routeSummary && (
        <div className="route-summary-panel" style={{ bottom: routeInstructions.length > 0 ? 250 : 24 }}>
          <div className="summary-header">
            <div className={`summary-title ${routeSummary.isEnterprise ? 'enterprise' : routeSummary.isOptimized ? 'optimized' : ''}`}>
              {routeSummary.isEnterprise ? 'Enterprise Route' : 
               routeSummary.isOptimized ? 'Optimized Route' : 'Route Summary'}
            </div>
            <div className="summary-actions">
              <button
                onClick={simulateRoute}
                className={`summary-clear-btn ${isSimulating ? 'active' : ''}`}
                style={{ 
                  backgroundColor: isSimulating ? '#dc3545' : '#28a745',
                  minWidth: '80px'
                }}
                title={isSimulating ? 'Stop simulation' : 'Start route simulation'}
              >
                {isSimulating ? `Stop (${simulationProgress}%)` : 'Simulate'}
              </button>
              <button
                onClick={() => {
                  cleanupAllRoutes();
                  setRouteGeoJson(null);
                  setRouteSummary(null);
                  setRouteInstructions([]);
                  setPoints([]);
                  setAlternativeRoutes([]);
                  setShowRouteOptions(false);
                  cleanupSimulation();
                }}
                className="summary-clear-btn"
                title="Clear route"
              >
                Clear
              </button>
              <button
                onClick={() => setRouteSummary(null)}
                className="summary-close-btn"
                title="Close summary"
              >
                ×
              </button>
            </div>
          </div>
          <div className="summary-details">
            <div><strong>Distance:</strong> <span className={routeSummary.isEnterprise ? 'enterprise-text' : routeSummary.isOptimized ? 'optimized-text' : 'primary-text'}>{routeSummary.distance}</span></div>
            <div><strong>Time:</strong> <span className={routeSummary.isEnterprise ? 'enterprise-text' : routeSummary.isOptimized ? 'optimized-text' : 'primary-text'}>{routeSummary.time}</span></div>
            {routeSummary.alternativeCount > 0 && (
              <div className="alternatives-info">
                <strong>Alternatives:</strong> {routeSummary.alternativeCount} route{routeSummary.alternativeCount > 1 ? 's' : ''} available
              </div>
            )}
          </div>
          {routeSummary.isOptimized && !routeSummary.isEnterprise && (
            <div className="optimized-badge-container">
              <span className="optimized-route-badge">FASTEST ROUTE</span>
            </div>
          )}
          {routeSummary.isEnterprise && (
            <div className="enterprise-details">
              <div className="enterprise-checkmark">✓ Truck-legal route with vehicle restrictions</div>
              {routeSummary.truckSpecs && (
                <div className="truck-specs">
                  Vehicle: {routeSummary.truckSpecs.weight}kg, {routeSummary.truckSpecs.height}m H, {routeSummary.truckSpecs.width}m W, {routeSummary.truckSpecs.length}m L
                </div>
              )}
            </div>
          )}
        </div>
      )}
      
      {/* Floating Search Bar for Map Panning */}
      <div className="search-bar-container">
        <input
          type="text"
          value={search}
          onChange={handleSearchChange}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setTimeout(() => setIsFocused(false), 200)}
          placeholder="Search for a place..."
          className="search-input"
        />
        {isFocused && suggestions.length > 0 && (
          <ul className="suggestions-list">
            {suggestions.map((s, i) => (
              <li
                key={s.id || i}
                onMouseDown={() => handleSuggestionClick(s)}
                className="suggestion-item"
              >
                {s.address.freeformAddress}
              </li>
            ))}
          </ul>
        )}
      </div>
      
      <div className="planner-container">
        <button
          onClick={() => setPlannerOpen((v) => !v)}
          className="planner-toggle-btn"
        >
          {plannerOpen ? 'Close Route Planner' : 'Open Route Planner'}
        </button>
        {plannerOpen && (
          <div className="planner-panel">
            <div className="planner-title">Route Planner</div>
            {routeInputs.map((input, idx) => (
              <div key={idx} className="route-input-group">
                <input
                  type="text"
                  value={input.value}
                  onChange={e => handleRouteInputChange(idx, e.target.value)}
                  placeholder={idx === 0 ? 'Start location' : `Destination ${idx}`}
                  className="route-input"
                />
                <button
                  onClick={() => handlePickClick(idx)}
                  className={`pick-btn ${pickIndex === idx ? 'picking' : ''}`}
                  title="Pick on map"
                >
                  {pickIndex === idx ? 'Click…' : 'Pick'}
                </button>
                {input.suggestions && input.suggestions.length > 0 && (
                  <ul className="route-suggestions-list">
                    {input.suggestions.map((s, i) => (
                      <li
                        key={s.id || i}
                        onMouseDown={() => handleRouteSuggestionClick(idx, s)}
                        className="route-suggestion-item"
                      >
                        {s.address.freeformAddress}
                      </li>
                    ))}
                  </ul>
                )}
                {idx > 1 && (
                  <button onClick={() => handleRemoveDestination(idx)} className="remove-btn" title="Remove destination">×</button>
                )}
              </div>
            ))}
            <button onClick={handleAddDestination} className="add-destination-btn">+ Add Destination</button>
            
            {/* Enterprise Mode Toggle */}
            <div className={`enterprise-mode-toggle-container ${isEnterpriseMode ? 'active' : ''}`}>
              <label className="enterprise-mode-label">
                <input
                  type="checkbox"
                  checked={isEnterpriseMode}
                  onChange={e => setIsEnterpriseMode(e.target.checked)}
                  className="enterprise-mode-checkbox"
                />
                <span className="enterprise-mode-text">
                  Enterprise Delivery Mode
                </span>
              </label>
              {isEnterpriseMode && (
                <>
                  <div className="enterprise-description">
                    Optimized routing for commercial delivery vehicles. Routes consider truck restrictions, bridge heights, and legal truck roads.
                  </div>
                  
                  {/* Truck Specifications */}
                  <div className="truck-specs-container">
                    <div className="specs-title">Vehicle Specifications:</div>
                    <div className="specs-grid">
                      <input type="number" min="0" step="0.1" value={truckSpecs.weight} onChange={e => setTruckSpecs(prev => ({ ...prev, weight: e.target.value }))} placeholder="Weight (kg)" className="spec-input"/>
                      <input type="number" min="0" step="0.1" value={truckSpecs.height} onChange={e => setTruckSpecs(prev => ({ ...prev, height: e.target.value }))} placeholder="Height (m)" className="spec-input"/>
                      <input type="number" min="0" step="0.1" value={truckSpecs.width} onChange={e => setTruckSpecs(prev => ({ ...prev, width: e.target.value }))} placeholder="Width (m)" className="spec-input"/>
                      <input type="number" min="0" step="0.1" value={truckSpecs.length} onChange={e => setTruckSpecs(prev => ({ ...prev, length: e.target.value }))} placeholder="Length (m)" className="spec-input"/>
                    </div>
                    <div className="specs-note">
                      Default: 15t truck, 4.0m height, 2.5m width, 12m length
                    </div>
                  </div>
                </>
              )}
            </div>
            
            {!isEnterpriseMode && (
              <div className="mode-selection">
                <label className="mode-label">Mode:</label>
                <select value={mode} onChange={e => setMode(e.target.value)} className="mode-select">
                  <option value="car">Car</option>
                  <option value="truck">Truck</option>
                  <option value="pedestrian">Pedestrian</option>
                  <option value="bicycle">Bicycle</option>
                </select>
              </div>
            )}
            
            {!isEnterpriseMode && (mode === 'car' || mode === 'truck') && (
              <div className="fuel-inputs">
                <input type="number" min="0" value={fuelCapacity} onChange={e => setFuelCapacity(e.target.value)} placeholder="Capacity (L)" className="fuel-input"/>
                <input type="number" min="0" value={mileage} onChange={e => setMileage(e.target.value)} placeholder="km/L" className="fuel-input"/>
                <input type="number" min="0" value={currentFuel} onChange={e => setCurrentFuel(e.target.value)} placeholder="Current (L)" className="fuel-input"/>
              </div>
            )}
            <button onClick={handlePlannerRoute} className="calculate-btn" disabled={routeInputs.filter(f => f.coords).length < 2}>
              Calculate Route
            </button>
          </div>
        )}
      </div>
      
      {/* Map container */}
      <div ref={mapContainer} className="map-canvas"/>
      
      {/* Traffic toggle button */}
      {userLocation && (
        <button
          onClick={() => setShowTraffic((v) => !v)}
          className={`traffic-toggle-btn ${showTraffic ? 'active' : ''}`}
          title="Toggle traffic layer (visible when zoomed in)"
        >
          
          🚦

        </button>
      )}
      
      {/* Recenter button */}
      {userLocation && (
        <button
          onClick={handleRecenter}
          className="recenter-btn"
          title="Recenter to your location"
        >
           ⦿
        </button>
      )}

      {/* Vehicle Location Button */}
      {vehicleLocation && (
        <button
          onClick={handleShowVehicleLocation}
          className="vehicle-location-btn"
          title="Show vehicle's current location"
          style={{
            position: 'absolute',
            bottom: '160px',
            right: '40px',
            zIndex: '22',
            padding: '12px',
            borderRadius: '50%',
            border: 'none',
            background: '#fff',
            color: '#0078d7',
            boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
            cursor: 'pointer',
            fontWeight: 'bold',
            fontSize: '20px',
            transition: 'background 0.2s, color 0.2s',
          }}
        >
          📍
        </button>
      )}

      {/* Vehicle Location Popup */}
      {showVehiclePopup && vehicleLocation && (
        <div
          className={`vehicle-location-popup ${isEnterpriseMode ? 'enterprise-mode' : ''}`}
          style={{
            position: 'absolute',
            top: `${mapInstance.current?.getCanvas().clientHeight / 2 - 70}px`,
            left: `${mapInstance.current?.getCanvas().clientWidth / 2}px`,
            transform: 'translateX(-50%)',
            background: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(10px)',
            border: '1px solid #ddd',
            borderRadius: '8px',
            padding: '12px 16px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            zIndex: '25',
            fontSize: '14px',
            fontWeight: '500',
            color: '#333',
            minWidth: '200px',
            textAlign: 'center',
            animation: 'fadeIn 0.3s ease-in-out',
          }}
        >
          <p style={{ margin: 0 }}>
            Vehicle at: <span className="location-text" style={{ color: '#0078d7', fontWeight: 'bold' }}>
              {vehicleLocation.address || `${vehicleLocation.lat.toFixed(4)}, ${vehicleLocation.lon.toFixed(4)}`}
            </span>
          </p>
        </div>
      )}
    </div>
  );
};

export default TomTomMap;
