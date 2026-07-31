document.addEventListener('DOMContentLoaded', function() {
  // Mobile menu
  const menuBtn = document.getElementById('mobileMenuBtn');
  const mainNav = document.getElementById('mainNav');
  if (menuBtn && mainNav) {
    menuBtn.addEventListener('click', function() { mainNav.classList.toggle('open'); });
    document.addEventListener('click', function(e) {
      if (!menuBtn.contains(e.target) && !mainNav.contains(e.target)) mainNav.classList.remove('open');
    });
  }

  // FAQ accordion
  document.querySelectorAll('.faq-question').forEach(function(q) {
    q.addEventListener('click', function() {
      const item = this.parentElement;
      item.classList.toggle('open');
    });
  });

  // Product thumbnails
  document.querySelectorAll('.product-thumb').forEach(function(thumb) {
    thumb.addEventListener('click', function() {
      document.querySelectorAll('.product-thumb').forEach(function(t) { t.classList.remove('active'); });
      this.classList.add('active');
      const main = document.getElementById('mainProductImage');
      if (main) main.src = this.dataset.image;
    });
  });

  // Quantity selectors
  document.querySelectorAll('.qty-minus').forEach(function(btn) {
    btn.addEventListener('click', function() {
      const input = this.parentElement.querySelector('.qty-input');
      if (input && parseInt(input.value) > 1) input.value = parseInt(input.value) - 1;
    });
  });
  document.querySelectorAll('.qty-plus').forEach(function(btn) {
    btn.addEventListener('click', function() {
      const input = this.parentElement.querySelector('.qty-input');
      if (input) {
        const max = parseInt(input.max) || 999;
        if (parseInt(input.value) < max) input.value = parseInt(input.value) + 1;
      }
    });
  });

  // Sticky buy button
  const stickyBuy = document.getElementById('stickyBuy');
  if (stickyBuy) {
    const productSection = document.querySelector('.product-info-section');
    if (productSection) {
      window.addEventListener('scroll', function() {
        const rect = productSection.getBoundingClientRect();
        stickyBuy.classList.toggle('show', rect.bottom < 0);
      });
    }
  }

  // Delivery type selection
  document.querySelectorAll('.delivery-type').forEach(function(el) {
    el.addEventListener('click', function() {
      document.querySelectorAll('.delivery-type').forEach(function(d) { d.classList.remove('selected'); });
      this.classList.add('selected');
      const input = this.querySelector('input[type="radio"]');
      if (input) input.checked = true;
    });
  });

  // Payment method selection
  document.querySelectorAll('.payment-method').forEach(function(el) {
    el.addEventListener('click', function() {
      document.querySelectorAll('.payment-method').forEach(function(p) { p.classList.remove('selected'); });
      this.classList.add('selected');
      const input = this.querySelector('input[type="radio"]');
      if (input) input.checked = true;
    });
  });

  // Wilaya-commune cascading
  const wilayaSelect = document.getElementById('wilaya');
  const communeSelect = document.getElementById('commune');
  const shippingDisplay = document.getElementById('shippingDisplay');
  const subtotalEl = document.getElementById('checkoutSubtotal');

  if (wilayaSelect && communeSelect) {
    wilayaSelect.addEventListener('change', function() {
      const code = this.value;
      communeSelect.innerHTML = '<option value="">Chargement...</option>';
      communeSelect.disabled = true;
      if (code) {
        fetch('/api/communes/' + code).then(function(r) { return r.json(); }).then(function(data) {
          communeSelect.innerHTML = '<option value="">Sélectionnez une commune</option>';
          data.forEach(function(c) {
            var opt = document.createElement('option');
            opt.value = c.id;
            opt.textContent = c.name_fr + ' (' + c.name_ar + ')';
            communeSelect.appendChild(opt);
          });
          communeSelect.disabled = false;
          communeSelect.name = 'commune_id';
        });
        fetch('/api/shipping/' + code).then(function(r) { return r.json(); }).then(function(data) {
          if (shippingDisplay) {
            var subtotal = parseFloat(subtotalEl ? subtotalEl.dataset.subtotal : 0);
            if (data.free_shipping_min && subtotal >= data.free_shipping_min) {
              shippingDisplay.innerHTML = '<span class="badge-success">Gratuit</span>';
            } else {
              shippingDisplay.textContent = data.shipping_price + ' DA';
            }
          }
        });
      } else {
        communeSelect.innerHTML = '<option value="">Sélectionnez d\'abord une wilaya</option>';
      }
    });
  }

  // Flash sale countdowns
  document.querySelectorAll('.flash-countdown').forEach(function(el) {
    var endDate = el.dataset.end;
    function update() {
      var diff = new Date(endDate) - new Date();
      if (diff <= 0) { el.innerHTML = 'Terminé'; return; }
      var h = Math.floor(diff / 3600000);
      var m = Math.floor((diff % 3600000) / 60000);
      var s = Math.floor((diff % 60000) / 1000);
      el.querySelector('.hours').textContent = String(h).padStart(2, '0');
      el.querySelector('.mins').textContent = String(m).padStart(2, '0');
      el.querySelector('.secs').textContent = String(s).padStart(2, '0');
    }
    update();
    setInterval(update, 1000);
  });
});