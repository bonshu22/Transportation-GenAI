import React, { useState, useEffect } from 'react';
import './CustomerManager.css';

const CustomerManager = ({ onCustomerSelect, onClose, tomtomApiKey }) => {
  const [customers, setCustomers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newCustomer, setNewCustomer] = useState({
    name: '',
    phone: '',
    address: '',
    coords: null,
    notes: '',
    deliveryInstructions: '',
    timeWindow: { start: '', end: '' }
  });
  const [addressSuggestions, setAddressSuggestions] = useState([]);

  // Load customers from localStorage on component mount
  useEffect(() => {
    const savedCustomers = localStorage.getItem('deliveryCustomers');
    if (savedCustomers) {
      setCustomers(JSON.parse(savedCustomers));
    }
  }, []);

  // Save customers to localStorage whenever customers change
  useEffect(() => {
    localStorage.setItem('deliveryCustomers', JSON.stringify(customers));
  }, [customers]);

  // Address autocomplete for new customer
  const handleAddressChange = async (value) => {
    setNewCustomer(prev => ({ ...prev, address: value, coords: null }));
    
    if (value.length < 3) {
      setAddressSuggestions([]);
      return;
    }

    try {
      const endpoint = `https://api.tomtom.com/search/2/search/${encodeURIComponent(value)}.json?key=${tomtomApiKey}&limit=5&typeahead=true`;
      const res = await fetch(endpoint);
      const data = await res.json();
      setAddressSuggestions(data.results || []);
    } catch {
      setAddressSuggestions([]);
    }
  };

  const handleAddressSuggestionClick = (suggestion) => {
    setNewCustomer(prev => ({
      ...prev,
      address: suggestion.address.freeformAddress,
      coords: [suggestion.position.lon, suggestion.position.lat]
    }));
    setAddressSuggestions([]);
  };

  const handleAddCustomer = () => {
    if (!newCustomer.name.trim() || !newCustomer.address.trim()) {
      alert('Name and address are required');
      return;
    }

    const customer = {
      id: Date.now().toString(),
      ...newCustomer,
      dateAdded: new Date().toISOString()
    };

    setCustomers(prev => [...prev, customer]);
    setNewCustomer({
      name: '',
      phone: '',
      address: '',
      coords: null,
      notes: '',
      deliveryInstructions: '',
      timeWindow: { start: '', end: '' }
    });
    setShowAddForm(false);
  };

  const handleDeleteCustomer = (id) => {
    if (window.confirm('Are you sure you want to delete this customer?')) {
      setCustomers(prev => prev.filter(c => c.id !== id));
    }
  };

  const handleSelectCustomer = (customer) => {
    onCustomerSelect(customer);
  };

  const filteredCustomers = customers.filter(customer =>
    customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    customer.address.toLowerCase().includes(searchTerm.toLowerCase()) ||
    customer.phone.includes(searchTerm)
  );

  return (
    <div className="customer-manager-overlay">
      <div className="customer-manager-panel">
        <div className="customer-manager-header">
          <h2 className="customer-manager-title">📋 Customer Address Book</h2>
          <button onClick={onClose} className="close-btn">×</button>
        </div>

        <div className="customer-manager-actions">
          <div className="search-container">
            <input
              type="text"
              placeholder="Search customers..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="customer-search-input"
            />
          </div>
          <button
            onClick={() => setShowAddForm(true)}
            className="add-customer-btn"
          >
            + Add Customer
          </button>
        </div>

        {showAddForm && (
          <div className="add-customer-form">
            <h3>Add New Customer</h3>
            <div className="form-grid">
              <input
                type="text"
                placeholder="Customer Name *"
                value={newCustomer.name}
                onChange={(e) => setNewCustomer(prev => ({ ...prev, name: e.target.value }))}
                className="form-input"
              />
              <input
                type="tel"
                placeholder="Phone Number"
                value={newCustomer.phone}
                onChange={(e) => setNewCustomer(prev => ({ ...prev, phone: e.target.value }))}
                className="form-input"
              />
            </div>
            
            <div className="address-input-container">
              <input
                type="text"
                placeholder="Address *"
                value={newCustomer.address}
                onChange={(e) => handleAddressChange(e.target.value)}
                className="form-input address-input"
              />
              {addressSuggestions.length > 0 && (
                <ul className="address-suggestions">
                  {addressSuggestions.map((s, i) => (
                    <li
                      key={s.id || i}
                      onClick={() => handleAddressSuggestionClick(s)}
                      className="address-suggestion-item"
                    >
                      {s.address.freeformAddress}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="time-window-container">
              <label className="time-window-label">Preferred Delivery Time:</label>
              <div className="time-inputs">
                <input
                  type="time"
                  value={newCustomer.timeWindow.start}
                  onChange={(e) => setNewCustomer(prev => ({
                    ...prev,
                    timeWindow: { ...prev.timeWindow, start: e.target.value }
                  }))}
                  className="time-input"
                />
                <span>to</span>
                <input
                  type="time"
                  value={newCustomer.timeWindow.end}
                  onChange={(e) => setNewCustomer(prev => ({
                    ...prev,
                    timeWindow: { ...prev.timeWindow, end: e.target.value }
                  }))}
                  className="time-input"
                />
              </div>
            </div>

            <textarea
              placeholder="Delivery Instructions (e.g., gate code, special instructions)"
              value={newCustomer.deliveryInstructions}
              onChange={(e) => setNewCustomer(prev => ({ ...prev, deliveryInstructions: e.target.value }))}
              className="form-textarea"
              rows={2}
            />

            <textarea
              placeholder="Additional Notes"
              value={newCustomer.notes}
              onChange={(e) => setNewCustomer(prev => ({ ...prev, notes: e.target.value }))}
              className="form-textarea"
              rows={2}
            />

            <div className="form-actions">
              <button onClick={handleAddCustomer} className="save-btn">Save Customer</button>
              <button onClick={() => setShowAddForm(false)} className="cancel-btn">Cancel</button>
            </div>
          </div>
        )}

        <div className="customers-list">
          {filteredCustomers.length === 0 ? (
            <div className="no-customers">
              {customers.length === 0 ? 'No customers added yet.' : 'No customers match your search.'}
            </div>
          ) : (
            filteredCustomers.map(customer => (
              <div key={customer.id} className="customer-card">
                <div className="customer-info">
                  <div className="customer-name">{customer.name}</div>
                  <div className="customer-address">{customer.address}</div>
                  {customer.phone && (
                    <div className="customer-phone">📞 {customer.phone}</div>
                  )}
                  {(customer.timeWindow.start || customer.timeWindow.end) && (
                    <div className="customer-time">
                      🕒 {customer.timeWindow.start || '00:00'} - {customer.timeWindow.end || '23:59'}
                    </div>
                  )}
                  {customer.deliveryInstructions && (
                    <div className="customer-instructions">📝 {customer.deliveryInstructions}</div>
                  )}
                </div>
                <div className="customer-actions">
                  <button
                    onClick={() => handleSelectCustomer(customer)}
                    className="select-btn"
                  >
                    Select
                  </button>
                  <button
                    onClick={() => handleDeleteCustomer(customer.id)}
                    className="delete-btn"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="customer-manager-footer">
          <div className="customer-count">
            {filteredCustomers.length} of {customers.length} customers
          </div>
        </div>
      </div>
    </div>
  );
};

export default CustomerManager;
