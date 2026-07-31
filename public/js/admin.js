document.addEventListener('DOMContentLoaded', function() {
  const nameInput = document.getElementById('name_ar') || document.getElementById('name_fr');
  const slugInput = document.getElementById('slug');
  if (nameInput && slugInput && !slugInput.value) {
    nameInput.addEventListener('input', function() {
      slugInput.value = this.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    });
  }
  const confirmBtn = document.querySelector('[data-confirm]');
  if (confirmBtn) {
    confirmBtn.addEventListener('click', function(e) {
      if (!confirm(this.dataset.confirm || 'Are you sure?')) e.preventDefault();
    });
  }
  document.querySelectorAll('[data-confirm]').forEach(function(el) {
    el.addEventListener('click', function(e) {
      if (!confirm(this.dataset.confirm || 'Are you sure?')) e.preventDefault();
    });
  });
});