import React, { useState, useEffect, useRef } from 'react';

export default function PaymentSandbox() {
  const [selectedAmount, setSelectedAmount] = useState(500);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const quickPayFormRef = useRef(null);

  useEffect(() => {
    if (!quickPayFormRef.current) return;
    
    // Clear out to prevent duplication during hot reloads
    quickPayFormRef.current.innerHTML = '';
    
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/payment-button.js';
    script.setAttribute('data-payment_button_id', 'pl_TDi5nRLHukOWRg');
    script.async = true;
    
    quickPayFormRef.current.appendChild(script);
  }, []);

  const handlePayment = async () => {
    setIsProcessingPayment(true);
    try {
      // 1. Create order on the backend
      const response = await fetch('http://localhost:5001/api/create-order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ amount: selectedAmount })
      });
      
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to create payment order');
      }
      
      const orderData = await response.json();
      
      // 2. Open Razorpay Checkout Modal
      const options = {
        key: import.meta.env.VITE_RAZORPAY_KEY_ID, // Loaded from env in Vite
        amount: orderData.amount,
        currency: orderData.currency,
        name: 'Studio-OS',
        description: 'Test Premium Subscription Payment',
        order_id: orderData.order_id,
        handler: async (paymentResponse) => {
          setIsProcessingPayment(true);
          try {
            // 3. Verify Payment Signature
            const verifyResponse = await fetch('http://localhost:5001/api/verify-payment', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                razorpay_order_id: paymentResponse.razorpay_order_id,
                razorpay_payment_id: paymentResponse.razorpay_payment_id,
                razorpay_signature: paymentResponse.razorpay_signature
              })
            });
            
            const verifyData = await verifyResponse.json();
            if (verifyResponse.ok && verifyData.success) {
              alert(`🎉 Payment Successful!\nTransaction ID: ${paymentResponse.razorpay_payment_id}\nYour premium subscription is now active.`);
            } else {
              alert(`❌ Payment verification failed: ${verifyData.error || 'Signature mismatch'}`);
            }
          } catch (verifyErr) {
            console.error(verifyErr);
            alert(`❌ Payment verification error: ${verifyErr.message}`);
          } finally {
            setIsProcessingPayment(false);
          }
        },
        prefill: {
          name: 'Sandbox Customer',
          email: 'customer@studio-os.com',
          contact: '9999999999'
        },
        theme: {
          color: '#6366f1' // brand primary color (indigo)
        },
        modal: {
          ondismiss: () => {
            alert('⚠️ Payment checkout closed by user.');
            setIsProcessingPayment(false);
          }
        }
      };

      const rzp = new window.Razorpay(options);
      
      rzp.on('payment.failed', (response) => {
        console.error('Payment failed details:', response.error);
        alert(`❌ Payment failed: ${response.error.description || 'Transaction declined'}`);
        setIsProcessingPayment(false);
      });
      
      rzp.open();
      
    } catch (err) {
      console.error('Payment initialization error:', err);
      alert(`❌ Failed to start checkout: ${err.message}`);
      setIsProcessingPayment(false);
    }
  };

  return (
    <div className="card glass-card payment-test-card animate-fade-in">
      <div className="payment-test-header">
        <div className="payment-title">
          <div className="payment-title-icon">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="5" width="20" height="14" rx="2" ry="2" />
              <line x1="2" y1="10" x2="22" y2="10" />
            </svg>
          </div>
          <h3>Payment Gateway Sandbox</h3>
        </div>
        <span className="badge badge-sandbox">Test Gateway</span>
      </div>
      <div className="payment-test-body">
        <div className="amount-selector-row">
          <span className="select-label">Select Amount:</span>
          <div className="amount-options">
            {[500, 1000, 5999].map((amt) => (
              <button
                key={amt}
                className={`amount-btn ${selectedAmount === amt ? 'active' : ''}`}
                onClick={() => setSelectedAmount(amt)}
              >
                ₹{amt.toLocaleString('en-IN')}
              </button>
            ))}
          </div>
          <button 
            className="btn-primary pay-now-btn" 
            onClick={handlePayment}
            disabled={isProcessingPayment}
          >
            {isProcessingPayment ? (
              <>
                <span className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px', marginRight: '6px', borderTopColor: '#fff' }}></span>
                Loading...
              </>
            ) : (
              'Pay Now'
            )}
          </button>
        </div>

        {/* Flat ₹5999 Quick Pay Pre-built Button */}
        <div className="quick-pay-row" style={{ marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px dashed var(--border-glass)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div className="quick-pay-info">
            <span className="select-label" style={{ display: 'block', marginBottom: '0.25rem' }}>Quick Pay Checkout:</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Pay flat ₹5,999 directly via Razorpay Hosted Payment button</span>
          </div>
          <form ref={quickPayFormRef} style={{ minHeight: '40px', display: 'flex', alignItems: 'center' }}>
            {/* Script injected dynamically */}
          </form>
        </div>
      </div>
    </div>
  );
}
