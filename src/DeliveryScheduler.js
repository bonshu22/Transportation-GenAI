import React, { useState, useEffect } from 'react';
import './DeliveryScheduler.css';

const DeliveryScheduler = ({ onDeliveryPlan, onClose, customers = [] }) => {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [driverInfo, setDriverInfo] = useState({
    name: '',
    vehicleType: 'truck',
    capacity: '',
    startLocation: '',
    startCoords: null
  });
  const [deliveries, setDeliveries] = useState([]);
  const [startTimeSuggestions, setStartTimeSuggestions] = useState([]);
  const [showDriverForm, setShowDriverForm] = useState(false);

  // Load saved driver info and deliveries
  useEffect(() => {
    const savedDriver = localStorage.getItem('driverInfo');
    if (savedDriver) {
      setDriverInfo(JSON.parse(savedDriver));
    }
    
    const savedDeliveries = localStorage.getItem(`deliveries_${selectedDate}`);
    if (savedDeliveries) {
      setDeliveries(JSON.parse(savedDeliveries));
    } else {
      setDeliveries([]);
    }
  }, [selectedDate]);

  // Save driver info and deliveries
  useEffect(() => {
    localStorage.setItem('driverInfo', JSON.stringify(driverInfo));
  }, [driverInfo]);

  useEffect(() => {
    localStorage.setItem(`deliveries_${selectedDate}`, JSON.stringify(deliveries));
  }, [deliveries, selectedDate]);

  const addDelivery = (customer = null) => {
    const newDelivery = {
      id: Date.now().toString(),
      customerId: customer?.id || null,
      customerName: customer?.name || '',
      address: customer?.address || '',
      coords: customer?.coords || null,
      phone: customer?.phone || '',
      timeWindow: customer?.timeWindow || { start: '', end: '' },
      deliveryInstructions: customer?.deliveryInstructions || '',
      estimatedTime: '',
      priority: 'normal',
      status: 'pending',
      items: '',
      notes: ''
    };
    setDeliveries(prev => [...prev, newDelivery]);
  };

  const updateDelivery = (id, updates) => {
    setDeliveries(prev => prev.map(d => d.id === id ? { ...d, ...updates } : d));
  };

  const removeDelivery = (id) => {
    setDeliveries(prev => prev.filter(d => d.id !== id));
  };

  const optimizeRoute = () => {
    if (deliveries.length === 0) {
      alert('Please add some deliveries first');
      return;
    }

    if (!driverInfo.startCoords) {
      alert('Please set a start location for the driver');
      return;
    }

    // Sort deliveries by priority and time windows
    const optimizedDeliveries = [...deliveries].sort((a, b) => {
      // Priority: urgent > high > normal > low
      const priorityOrder = { urgent: 0, high: 1, normal: 2, low: 3 };
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      
      if (priorityDiff !== 0) return priorityDiff;
      
      // If same priority, sort by time window start
      if (a.timeWindow.start && b.timeWindow.start) {
        return a.timeWindow.start.localeCompare(b.timeWindow.start);
      }
      
      return 0;
    });

    setDeliveries(optimizedDeliveries);
  };

  const generateDeliveryPlan = () => {
    if (deliveries.length === 0) {
      alert('Please add some deliveries first');
      return;
    }

    if (!driverInfo.startCoords) {
      alert('Please set a start location for the driver');
      return;
    }

    const plan = {
      date: selectedDate,
      driver: driverInfo,
      deliveries: deliveries.filter(d => d.coords),
      startLocation: {
        address: driverInfo.startLocation,
        coords: driverInfo.startCoords
      }
    };

    onDeliveryPlan(plan);
  };

  const handleStartLocationChange = async (value) => {
    setDriverInfo(prev => ({ ...prev, startLocation: value, startCoords: null }));
    
    if (value.length < 3) {
      setStartTimeSuggestions([]);
      return;
    }

    try {
      const endpoint = `https://api.tomtom.com/search/2/search/${encodeURIComponent(value)}.json?key=${process.env.REACT_APP_TOMTOM_API_KEY}&limit=5&typeahead=true`;
      const res = await fetch(endpoint);
      const data = await res.json();
      setStartTimeSuggestions(data.results || []);
    } catch {
      setStartTimeSuggestions([]);
    }
  };

  const handleStartLocationSelect = (suggestion) => {
    setDriverInfo(prev => ({
      ...prev,
      startLocation: suggestion.address.freeformAddress,
      startCoords: [suggestion.position.lon, suggestion.position.lat]
    }));
    setStartTimeSuggestions([]);
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'urgent': return '#dc3545';
      case 'high': return '#fd7e14';
      case 'normal': return '#28a745';
      case 'low': return '#6c757d';
      default: return '#28a745';
    }
  };

  const getStatusBadge = (status) => {
    const badges = {
      pending: { color: '#ffc107', text: 'Pending' },
      inProgress: { color: '#0078d7', text: 'In Progress' },
      delivered: { color: '#28a745', text: 'Delivered' },
      failed: { color: '#dc3545', text: 'Failed' }
    };
    return badges[status] || badges.pending;
  };

  return (
    <div className="delivery-scheduler-overlay">
      <div className="delivery-scheduler-panel">
        <div className="scheduler-header">
          <h2 className="scheduler-title">🚛 Delivery Scheduler</h2>
          <button onClick={onClose} className="close-btn">×</button>
        </div>

        <div className="scheduler-controls">
          <div className="date-selector">
            <label>Delivery Date:</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="date-input"
            />
          </div>
          
          <div className="driver-info-section">
            <button
              onClick={() => setShowDriverForm(!showDriverForm)}
              className="driver-info-btn"
            >
              👤 Driver Info {showDriverForm ? '▼' : '▶'}
            </button>
            
            {showDriverForm && (
              <div className="driver-form">
                <div className="driver-form-grid">
                  <input
                    type="text"
                    placeholder="Driver Name"
                    value={driverInfo.name}
                    onChange={(e) => setDriverInfo(prev => ({ ...prev, name: e.target.value }))}
                    className="driver-input"
                  />
                  <select
                    value={driverInfo.vehicleType}
                    onChange={(e) => setDriverInfo(prev => ({ ...prev, vehicleType: e.target.value }))}
                    className="driver-select"
                  >
                    <option value="truck">Truck</option>
                    <option value="van">Van</option>
                    <option value="car">Car</option>
                    <option value="motorcycle">Motorcycle</option>
                  </select>
                  <input
                    type="text"
                    placeholder="Vehicle Capacity"
                    value={driverInfo.capacity}
                    onChange={(e) => setDriverInfo(prev => ({ ...prev, capacity: e.target.value }))}
                    className="driver-input"
                  />
                </div>
                
                <div className="start-location-container">
                  <input
                    type="text"
                    placeholder="Start Location (Depot/Warehouse)"
                    value={driverInfo.startLocation}
                    onChange={(e) => handleStartLocationChange(e.target.value)}
                    className="start-location-input"
                  />
                  {startTimeSuggestions.length > 0 && (
                    <ul className="start-suggestions">
                      {startTimeSuggestions.map((s, i) => (
                        <li
                          key={s.id || i}
                          onClick={() => handleStartLocationSelect(s)}
                          className="start-suggestion-item"
                        >
                          {s.address.freeformAddress}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="deliveries-section">
          <div className="deliveries-header">
            <h3>Deliveries for {new Date(selectedDate).toLocaleDateString()}</h3>
            <div className="delivery-actions">
              <button onClick={() => addDelivery()} className="add-delivery-btn">
                + Manual Delivery
              </button>
              <button onClick={optimizeRoute} className="optimize-btn">
                🔄 Optimize Order
              </button>
            </div>
          </div>

          {customers.length > 0 && (
            <div className="customer-quick-add">
              <label>Quick Add from Customers:</label>
              <select
                onChange={(e) => {
                  const customer = customers.find(c => c.id === e.target.value);
                  if (customer) addDelivery(customer);
                  e.target.value = '';
                }}
                className="customer-select"
              >
                <option value="">Select a customer...</option>
                {customers.map(customer => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name} - {customer.address}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="deliveries-list">
            {deliveries.length === 0 ? (
              <div className="no-deliveries">
                No deliveries scheduled for this date.
                <br />Add deliveries manually or select from your customer list.
              </div>
            ) : (
              deliveries.map((delivery, index) => (
                <div key={delivery.id} className="delivery-card">
                  <div className="delivery-header">
                    <div className="delivery-order">#{index + 1}</div>
                    <div className="delivery-priority">
                      <select
                        value={delivery.priority}
                        onChange={(e) => updateDelivery(delivery.id, { priority: e.target.value })}
                        className="priority-select"
                        style={{ borderColor: getPriorityColor(delivery.priority) }}
                      >
                        <option value="low">Low Priority</option>
                        <option value="normal">Normal</option>
                        <option value="high">High Priority</option>
                        <option value="urgent">Urgent</option>
                      </select>
                    </div>
                    <div className="delivery-status">
                      <span
                        className="status-badge"
                        style={{ backgroundColor: getStatusBadge(delivery.status).color }}
                      >
                        {getStatusBadge(delivery.status).text}
                      </span>
                    </div>
                    <button
                      onClick={() => removeDelivery(delivery.id)}
                      className="remove-delivery-btn"
                    >
                      ×
                    </button>
                  </div>

                  <div className="delivery-details">
                    <div className="delivery-customer">
                      <input
                        type="text"
                        placeholder="Customer Name"
                        value={delivery.customerName}
                        onChange={(e) => updateDelivery(delivery.id, { customerName: e.target.value })}
                        className="customer-name-input"
                      />
                      <input
                        type="text"
                        placeholder="Phone Number"
                        value={delivery.phone}
                        onChange={(e) => updateDelivery(delivery.id, { phone: e.target.value })}
                        className="phone-input"
                      />
                    </div>

                    <input
                      type="text"
                      placeholder="Delivery Address"
                      value={delivery.address}
                      onChange={(e) => updateDelivery(delivery.id, { address: e.target.value })}
                      className="address-input"
                    />

                    <div className="delivery-time-window">
                      <label>Time Window:</label>
                      <input
                        type="time"
                        value={delivery.timeWindow.start}
                        onChange={(e) => updateDelivery(delivery.id, {
                          timeWindow: { ...delivery.timeWindow, start: e.target.value }
                        })}
                        className="time-window-input"
                      />
                      <span>to</span>
                      <input
                        type="time"
                        value={delivery.timeWindow.end}
                        onChange={(e) => updateDelivery(delivery.id, {
                          timeWindow: { ...delivery.timeWindow, end: e.target.value }
                        })}
                        className="time-window-input"
                      />
                    </div>

                    <div className="delivery-items">
                      <input
                        type="text"
                        placeholder="Items to deliver"
                        value={delivery.items}
                        onChange={(e) => updateDelivery(delivery.id, { items: e.target.value })}
                        className="items-input"
                      />
                    </div>

                    {delivery.deliveryInstructions && (
                      <div className="delivery-instructions">
                        📝 {delivery.deliveryInstructions}
                      </div>
                    )}

                    <textarea
                      placeholder="Additional notes..."
                      value={delivery.notes}
                      onChange={(e) => updateDelivery(delivery.id, { notes: e.target.value })}
                      className="notes-textarea"
                      rows={2}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="scheduler-footer">
          <div className="delivery-summary">
            <span className="delivery-count">{deliveries.length} deliveries scheduled</span>
            <span className="route-info">
              {deliveries.filter(d => d.coords).length} geocoded addresses
            </span>
          </div>
          <button
            onClick={generateDeliveryPlan}
            className="generate-route-btn"
            disabled={deliveries.length === 0 || !driverInfo.startCoords}
          >
            🗺️ Plan Route
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeliveryScheduler;
