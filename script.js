class InventarioApp {
    constructor() {
        this.db = null;
        this.DB_NAME = 'InventarioDB';
        this.DB_VERSION = 1;
        this.STORE_NAME = 'productos';
        this.products = [];
        this.init();
    }

    async init() {
        await this.initDB();
        await this.loadData();
        this.bindEvents();
        this.initVentas();
        this.setupEditModal();
        window.app = this;
    }

    async initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => { this.db = request.result; resolve(); };
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(this.STORE_NAME)) {
                    db.createObjectStore(this.STORE_NAME, { keyPath: 'id', autoIncrement: true });
                }
            };
        });
    }

    // --- GESTIÓN DE DATOS ---
    async loadData() {
        if (this.db) {
            const tx = this.db.transaction([this.STORE_NAME], 'readonly');
            const store = tx.objectStore(this.STORE_NAME);
            const request = store.getAll();
            this.products = await new Promise((resolve) => {
                request.onsuccess = () => resolve(request.result);
            });
        } else {
            const data = localStorage.getItem('inventarioBackup');
            this.products = data ? JSON.parse(data) : [];
        }
        this.renderProducts();
        this.updateStats();
    }

    saveToLocalStorage() {
        localStorage.setItem('inventarioBackup', JSON.stringify(this.products));
    }

    async updateProduct(id, updates) {
        const index = this.products.findIndex(p => p.id === id);
        if (index === -1) return;

        Object.assign(this.products[index], updates, { fechaActualizacion: new Date().toISOString() });

        if (this.db) {
            const tx = this.db.transaction([this.STORE_NAME], 'readwrite');
            tx.objectStore(this.STORE_NAME).put(this.products[index]);
        }
        this.saveToLocalStorage();
        this.renderProducts();
        this.updateStats();
    }

    // --- INTERFAZ PRINCIPAL ---
    bindEvents() {
        document.getElementById('productForm').onsubmit = (e) => {
            e.preventDefault();
            this.addProduct();
        };
        document.getElementById('searchInput').oninput = debounce(() => this.renderProducts(), 300);
        document.getElementById('filterStatus').onchange = () => this.renderProducts();
        document.getElementById('exportTxtBtn').onclick = () => this.exportTxt();
        document.getElementById('importTxtBtn').onclick = () => this.importTxt();
        document.getElementById('clearAllBtn').onclick = () => this.clearAll();
    }

    renderProducts() {
        const container = document.getElementById('productsList');
        const search = document.getElementById('searchInput').value.toLowerCase();
        const filter = document.getElementById('filterStatus').value;

        let filtered = this.products.filter(p => p.nombre.toLowerCase().includes(search));
        if (filter !== 'todos') {
            filtered = filtered.filter(p => this.getStockStatus(p) === filter);
        }

        container.innerHTML = filtered.map(p => {
            const status = this.getStockStatus(p);
            const statusClass = status === 'bajo' ? 'bajo-stock' : status === 'agotado' ? 'agotado' : '';
            return `
                <div class="product-card ${statusClass}">
                    <div class="product-header">
                        <div class="product-name">${p.nombre}</div>
                        <div class="product-actions">
                            <button class="btn-small" onclick="app.editCantidad(${p.id})">✏️</button>
                            <button class="btn-small btn-success" onclick="app.plusStock(${p.id})">➕</button>
                            <button class="btn-small btn-warning" onclick="app.minusStock(${p.id})">➖</button>
                            <button class="btn-small btn-danger" onclick="app.deleteProduct(${p.id})">🗑️</button>
                        </div>
                    </div>
                    <div class="product-details">
                        📦 <strong>${p.cantidad || 0}</strong> ${p.stockMin ? `(Mín: ${p.stockMin})` : ''}
                        ${p.precio ? `<br>💰 $${p.precio.toFixed(2)}` : ''}
                    </div>
                </div>`;
        }).join('');
    }

    // --- MÓDULO DE VENTAS (CORREGIDO) ---
    initVentas() {
        document.getElementById('ventaSearch').oninput = debounce((e) => this.updateVentaProductos(e.target.value), 200);
        document.getElementById('btnAgregarItem').onclick = () => this.agregarItemVenta();
        document.getElementById('btnRealizarVentaMulti').onclick = () => this.procesarVentaMulti();
        document.getElementById('btnCancelarVenta').onclick = () => this.cancelarVentaMulti();
        document.getElementById('fabVentas').onclick = () => this.toggleVentas();
        document.getElementById('closeVentas').onclick = () => document.getElementById('salesSection').classList.remove('active');
    }

    updateVentaProductos(search = '') {
        // En esta versión simplificada, el buscador directo agrega si hay coincidencia exacta o única
        console.log("Buscando productos para venta:", search);
    }

    agregarItemVenta() {
        const search = document.getElementById('ventaSearch').value.trim().toLowerCase();
        const cantidad = parseInt(document.getElementById('ventaCantidadInput').value) || 1;
        const producto = this.products.find(p => p.nombre.toLowerCase() === search || p.nombre.toLowerCase().includes(search));

        if (producto && producto.cantidad >= cantidad) {
            const existe = itemsVenta.find(item => item.id === producto.id);
            if (existe) { existe.cantidad += cantidad; } 
            else { itemsVenta.push({ id: producto.id, nombre: producto.nombre, precio: producto.precio, cantidad: cantidad }); }
            
            this.renderListaVenta();
            document.getElementById('ventaSearch').value = '';
        } else {
            this.showToast('Producto no encontrado o stock insuficiente', 'error');
        }
    }

    renderListaVenta() {
        const container = document.getElementById('ventaItemsList');
        if (itemsVenta.length === 0) {
            container.innerHTML = '<div class="empty-state">Carrito vacío</div>';
            this.actualizarTotales();
            return;
        }

        container.innerHTML = itemsVenta.map(item => `
            <div class="venta-item-row">
                <span>${item.nombre} x${item.cantidad}</span>
                <span>$${(item.precio * item.cantidad).toFixed(2)}</span>
                <button onclick="app.eliminarItemVenta(${item.id})">🗑️</button>
            </div>`).join('');
        this.actualizarTotales();
    }

    actualizarTotales() {
        const total = itemsVenta.reduce((sum, item) => sum + (item.precio * item.cantidad), 0);
        document.getElementById('granTotal').textContent = `$${total.toFixed(2)}`;
        document.getElementById('btnRealizarVentaMulti').disabled = itemsVenta.length === 0;
    }

    async procesarVentaMulti() {
        const btn = document.getElementById('btnRealizarVentaMulti');
        btn.disabled = true;

        try {
            const cliente = document.getElementById('clienteNombre').value || 'Cliente';
            const telefono = document.getElementById('clienteTelefono').value;
            const metodo = document.getElementById('metodoPagoMulti').value;
            const total = itemsVenta.reduce((sum, item) => sum + (item.precio * item.cantidad), 0);

            for (const item of itemsVenta) {
                const p = this.products.find(p => p.id === item.id);
                await this.updateProduct(item.id, { cantidad: p.cantidad - item.cantidad });
            }

            this.generarReciboMultiSimple(itemsVenta, cliente, telefono, total, metodo);
            itemsVenta = [];
            this.cancelarVentaMulti();
            this.showToast('Venta Exitosa ✅');
        } catch (e) {
            this.showToast('Error en venta', 'error');
            btn.disabled = false;
        }
    }

    generarReciboMultiSimple(items, cliente, telefono, total, metodo) {
        const fecha = new Date().toLocaleString();
        const telLimpio = String(telefono).replace(/[^0-9]/g, '');
        let msg = `*TICKET DE VENTA*\nCliente: ${cliente}\nTotal: $${total.toFixed(2)}\n\n`;
        items.forEach(i => msg += `- ${i.nombre} x${i.cantidad}\n`);

        const html = `
            <div class="recibo active">
                <h3>Ticket: ${cliente}</h3>
                <p>${fecha}</p>
                <button class="btn-print" onclick="window.enviarWhatsApp('${encodeURIComponent(msg)}', '${telLimpio}')">📱 WhatsApp</button>
                <button class="btn-print secondary" onclick="this.closest('.recibo').remove()">Cerrar</button>
            </div>`;
        
        document.querySelectorAll('.recibo').forEach(r => r.remove());
        document.body.insertAdjacentHTML('beforeend', html);
    }

    // --- UTILIDADES ---
    getStockStatus(p) {
        const q = p.cantidad || 0;
        return q === 0 ? 'agotado' : q <= (p.stockMin || 0) ? 'bajo' : 'normal';
    }

    showToast(msg, type = 'success') {
        const t = document.getElementById('toast');
        t.textContent = msg; t.className = `toast show ${type}`;
        setTimeout(() => t.classList.remove('show'), 2500);
    }

    toggleVentas() { document.getElementById('salesSection').classList.toggle('active'); }
    cancelarVentaMulti() { itemsVenta = []; this.renderListaVenta(); }
    plusStock(id) { const p = this.products.find(p => p.id === id); this.updateProduct(id, { cantidad: p.cantidad + 1 }); }
    minusStock(id) { const p = this.products.find(p => p.id === id); if(p.cantidad > 0) this.updateProduct(id, { cantidad: p.cantidad - 1 }); }
}

// ✅ FUNCION WHATSAPP GLOBAL
window.enviarWhatsApp = function(mensaje, telefono) {
    let num = String(telefono).replace(/[^0-9]/g, '');
    if (num.length < 7) num = prompt("Número de WhatsApp:", "58");
    if (!num) return;
    const finalNum = num.startsWith('58') ? num : '58' + num;
    window.open(`https://wa.me/${finalNum}?text=${mensaje}`, '_blank');
};

function debounce(fn, ms) {
    let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

let itemsVenta = [];
const app = new InventarioApp();