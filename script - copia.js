class InventarioApp {
    // ✅ EXPORTAR TXT - Formato súper simple
async exportTxt() {
    const txtContent = this.generarTxt();
    const blob = new Blob([txtContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `inventario_${new Date().toISOString().slice(0,10)}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    this.showToast('💾 TXT exportado ✅');
}

generarTxt() {
    let txt = `📦 INVENTARIO COMPLETO\n`;
    txt += `Fecha: ${new Date().toLocaleString('es-ES')}\n`;
    txt += `Total: ${this.products.length} productos\n\n`;
    txt += `NOMBRE                  STOCK  MÍN  PRECIO\n`;
    txt += `----------------------------------------\n`;

    this.products.forEach(p => {
        const nombre = p.nombre.padEnd(25).slice(0, 25);
        const stock = (p.cantidad || 0).toString().padEnd(6);
        const min = (p.stockMin || 0).toString().padEnd(4);
        const precio = p.precio ? `$${p.precio.toFixed(2)}`.padEnd(8) : 'Gratis  ';
        txt += `${nombre} | ${stock} | ${min} | ${precio}\n`;
    });

    txt += `\n📊 ESTADÍSTICAS:\n`;
    const bajoStock = this.products.filter(p => (p.cantidad || 0) <= (p.stockMin || 0)).length;
    const agotados = this.products.filter(p => (p.cantidad || 0) === 0).length;
    txt += `Bajo stock: ${bajoStock}\n`;
    txt += `Agotados: ${agotados}\n`;

    return txt;
}

// ✅ IMPORTAR TXT
async importTxt() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt,text/plain';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        try {
            const text = await file.text();
            const productos = this.parsearTxt(text);
            
            if (productos.length === 0) {
                this.showToast('❌ TXT vacío o inválido', 'error');
                return;
            }

            if (!confirm(`📄 Importar ${productos.length} productos?\n(Reemplazará inventario actual)`)) {
                return;
            }

            // LIMPIAR Y CARGAR
            this.products = productos.map((p, i) => ({
                id: i + 1,
                nombre: p.nombre,
                cantidad: p.cantidad,
                stockMin: p.stockMin,
                precio: p.precio,
                fechaCreacion: new Date().toISOString(),
                fechaActualizacion: new Date().toISOString()
            }));

            // GUARDAR
            this.saveToLocalStorage();
            if (this.db) {
                const tx = this.db.transaction([this.STORE_NAME], 'readwrite');
                const store = tx.objectStore(this.STORE_NAME);
                store.clear();
                this.products.forEach(p => store.add(p));
            }

            this.renderProducts();
            this.updateStats();
            this.showToast(`📁 ${productos.length} productos TXT importados ✅`);
            
        } catch (error) {
            this.showToast('❌ Error leyendo TXT', 'error');
        }
    };
    input.click();
}

// ✅ PARSER TXT - Lee formato simple
parsearTxt(text) {
    const lineas = text.split('\n').map(l => l.trim()).filter(l => l);
    const productos = [];

    // Buscar formato: "NOMBRE | STOCK | MÍN | PRECIO"
    for (const linea of lineas) {
        // Regex flexible para diferentes formatos
        const match1 = linea.match(/(.+?)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*\$?([\d.]+)/i);
        const match2 = linea.match(/(.+?)\s+Stock:\s+(\d+)\s+Mín:\s+(\d+)\s+Precio:\s+\$?([\d.]+)/i);
        
        if (match1) {
            const [, nombre, cantidad, stockMin, precio] = match1;
            productos.push({
                nombre: nombre.trim(),
                cantidad: parseInt(cantidad) || 0,
                stockMin: parseInt(stockMin) || 0,
                precio: parseFloat(precio) || 0
            });
        } else if (match2) {
            const [, nombre, cantidad, stockMin, precio] = match2;
            productos.push({
                nombre: nombre.trim(),
                cantidad: parseInt(cantidad) || 0,
                stockMin: parseInt(stockMin) || 0,
                precio: parseFloat(precio) || 0
            });
        }
    }
    
    return productos;
}
    constructor() {
        this.db = null;
        this.DB_NAME = 'InventarioDB';
        this.DB_VERSION = 1;
        this.STORE_NAME = 'productos';
        this.products = [];
        this.init();
    }

 async init() {
    console.log('🚀 App init...');
    
    await this.initDB();
    await this.loadData();
    
    // ✅ UNA SOLA VEZ
    this.bindEvents();
    this.initVentas();  // ← Limpia duplicados automáticamente
    this.setupEditModal();
    this.setupViewToggle();
    
    window.app = this;
    console.log('✅ Init completo');
}

    async initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(this.STORE_NAME)) {
                    db.createObjectStore(this.STORE_NAME, { keyPath: 'id', autoIncrement: true });
                }
            };
        });
    }

    fallbackToLocalStorage() {
        this.loadFromLocalStorage();
        this.renderProducts();
        this.updateStats();
    }

    loadFromLocalStorage() {
        try {
            const data = localStorage.getItem('inventarioBackup');
            this.products = data ? JSON.parse(data) : [];
        } catch (e) {
            this.products = [];
        }
    }

    saveToLocalStorage() {
        try {
            localStorage.setItem('inventarioBackup', JSON.stringify(this.products));
        } catch (e) {}
    }

    // ✅ bindEvents CORREGIDO - Sin duplicaciones
bindEvents() {
    // Solo elementos principales (NO ventas)
    document.getElementById('productForm').onsubmit = (e) => {
        e.preventDefault();
        this.addProduct();
    };
    
    document.getElementById('searchInput').oninput = debounce(() => this.renderProducts(), 300);
    document.getElementById('filterStatus').onchange = () => this.renderProducts();
    
    // TXT buttons
    document.getElementById('exportTxtBtn').onclick = () => this.exportTxt();
    document.getElementById('importTxtBtn').onclick = () => this.importTxt();
    document.getElementById('clearAllBtn').onclick = () => this.clearAll();
}
// ✅ CLEAR ALL - FUNCIONA 100%
clearAll() {
    if (confirm('🗑️ ¿Eliminar TODO el inventario?\nNo se puede deshacer.')) {
        // Limpiar IndexedDB
        if (this.db) {
            const tx = this.db.transaction([this.STORE_NAME], 'readwrite');
            const store = tx.objectStore(this.STORE_NAME);
            store.clear().onsuccess = () => {
                console.log('IndexedDB limpiado');
            };
        }
        
        // Limpiar cache y LocalStorage
        this.products = [];
        localStorage.removeItem('inventarioBackup');
        
        // Actualizar UI
        this.renderProducts();
        this.updateStats();
        
        this.showToast('🗑️ Inventario limpiado completamente ✅');
    }
}
    // ✅ AGREGAR PRODUCTO - FUNCIONA 100%
    async addProduct() {
        const nombre = document.getElementById('nombre').value.trim();
        const cantidad = parseInt(document.getElementById('cantidad').value) || 0;
        const precio = parseFloat(document.getElementById('precio').value) || 0;
        const stockMin = parseInt(document.getElementById('stockMin').value) || 0;

        if (!nombre) {
            this.showToast('Nombre requerido', 'error');
            return;
        }

        const product = {
            nombre, cantidad, precio, stockMin,
            fechaCreacion: new Date().toISOString(),
            fechaActualizacion: new Date().toISOString()
        };

        try {
            let id;
            if (this.db) {
                id = await this.saveToIndexedDB(product);
            } else {
                id = Date.now();
                product.id = id;
            }
            
            product.id = id;
            this.products.push(product);
            this.saveToLocalStorage();
            
            document.getElementById('productForm').reset();
            this.renderProducts();
            this.updateStats();
            this.showToast(`"${nombre}" guardado ✅`);
            
        } catch (error) {
            console.error('Error:', error);
            this.showToast('Error guardando', 'error');
        }
    }

    // ✅ GUARDAR EN INDEXEDDB - FUNCIÓN AUXILIAR
    saveToIndexedDB(product) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction([this.STORE_NAME], 'readwrite');
            const store = tx.objectStore(this.STORE_NAME);
            const request = store.add(product);
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // ✅ ACTUALIZAR PRODUCTO
    async updateProduct(id, updates) {
        const productIndex = this.products.findIndex(p => p.id === id);
        if (productIndex === -1) return;

        // Actualizar cache
        Object.assign(this.products[productIndex], updates, {
            fechaActualizacion: new Date().toISOString()
        });

        // Guardar IndexedDB
        if (this.db) {
            try {
                const tx = this.db.transaction([this.STORE_NAME], 'readwrite');
                const store = tx.objectStore(this.STORE_NAME);
                await new Promise((resolve, reject) => {
                    const request = store.put(this.products[productIndex]);
                    request.onsuccess = resolve;
                    request.onerror = reject;
                });
            } catch (e) {
                console.error('Error IndexedDB:', e);
            }
        }

        this.saveToLocalStorage();
        this.renderProducts();
        this.updateStats();
    }

    async loadData() {
        if (this.db) {
            try {
                const tx = this.db.transaction([this.STORE_NAME], 'readonly');
                const store = tx.objectStore(this.STORE_NAME);
                const request = store.getAll();
                
                const result = await new Promise((resolve, reject) => {
                    request.onsuccess = () => resolve(request.result);
                    request.onerror = () => reject(request.error);
                });
                
                this.products = result;
            } catch (e) {
                console.error('Load error:', e);
                this.loadFromLocalStorage();
            }
        } else {
            this.loadFromLocalStorage();
        }
        
        this.renderProducts();
    }

    renderProducts() {
    const container = document.getElementById('productsList');
    const search = document.getElementById('searchInput').value.toLowerCase();
    const filter = document.getElementById('filterStatus').value;

    let filtered = this.products.filter(p => 
        p.nombre.toLowerCase().includes(search)
    );

    if (filter !== 'todos') {
        filtered = filtered.filter(p => this.getStockStatus(p) === filter);
    }

    container.innerHTML = filtered.map(p => {
        const status = this.getStockStatus(p);
        const statusClass = status === 'bajo' ? 'bajo-stock' : status === 'agotado' ? 'agotado' : '';
        
        return `
            <div class="product-card ${statusClass}" data-id="${p.id}">
                <div class="product-header">
                    <div class="product-name" title="${p.nombre}">${p.nombre}</div>
                    <div class="product-actions">
                        <button class="btn-small" onclick="app.editCantidad(${p.id})" title="Editar">✏️</button>
                        <button class="btn-small btn-success" onclick="app.plusStock(${p.id})" title="+1">➕</button>
                        <button class="btn-small btn-warning" onclick="app.minusStock(${p.id})" title="-1">➖</button>
                        <button class="btn-small btn-danger" onclick="app.deleteProduct(${p.id})" title="Eliminar">🗑️</button>
                    </div>
                </div>
                <div class="product-details">
                    <div class="stock-line">
                        📦 <strong>${p.cantidad || 0}</strong> 
                        ${p.stockMin ? `(Mín: ${p.stockMin})` : ''}
                    </div>
                    ${p.precio ? `<div class="precio-line">💰 $${p.precio.toFixed(2)}</div>` : ''}
                    <div class="fecha-line">
                        ${new Date(p.fechaActualizacion).toLocaleDateString('es-ES')}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

    getStockStatus(p) {
        const qty = p.cantidad || 0;
        const min = p.stockMin || 0;
        return qty === 0 ? 'agotado' : qty <= min ? 'bajo' : 'normal';
    }

    plusStock(id) { 
        const p = this.products.find(p => p.id === id);
        if (p) this.updateProduct(id, { cantidad: p.cantidad + 1 }); 
    }

    minusStock(id) { 
        const p = this.products.find(p => p.id === id);
        if (p && p.cantidad > 0) this.updateProduct(id, { cantidad: p.cantidad - 1 }); 
    }

 // ✅ editCantidad CORREGIDA
editCantidad(id) {
    const producto = this.products.find(p => p.id === id);
    if (!producto) return;
    
    document.getElementById('editNombreProducto').textContent = producto.nombre;
    document.getElementById('editCantidad').value = producto.cantidad || 0;
    window.currentEditId = id;
    
    const modal = document.getElementById('editModal');
    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('active'), 10);
}

// ✅ initVentas Multi
initVentas() {
    // Limpiar listeners previos (anti-duplicación)
    ['ventaSearch', 'ventaCantidadInput', 'btnAgregarItem', 'btnRealizarVentaMulti', 'btnCancelarVenta'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            const newEl = el.cloneNode(true);
            el.parentNode.replaceChild(newEl, el);
        }
    });

    // Nuevos listeners
    document.getElementById('metodoPagoMulti').onchange = () => {
        console.log('💳 Pago:', document.getElementById('metodoPagoMulti').value);
    };
    document.getElementById('ventaSearch').oninput = debounce((e) => this.mostrarProductosVenta(e.target.value), 200);
    document.getElementById('btnAgregarItem').onclick = () => this.agregarItemVenta();
    document.getElementById('btnRealizarVentaMulti').onclick = () => this.procesarVentaMulti();
    document.getElementById('btnCancelarVenta').onclick = () => this.cancelarVentaMulti();
    
    document.getElementById('closeVentas').onclick = () => document.getElementById('salesSection').classList.remove('active');
    document.getElementById('fabVentas').onclick = () => this.toggleVentas();
    
    this.updateVentaProductos();
}

// ✅ seleccionarProductoVenta - Limpieza
seleccionarProductoVenta(id, precio) {
    console.log('✅ Seleccionado:', id, precio);
    app.ocultarDropdown();
    
    const cantidad = parseInt(document.getElementById('ventaCantidadInput').value) || 1;
    const producto = app.products.find(p => p.id === id);
    
    if (producto && cantidad <= producto.cantidad) {
        const existe = itemsVenta.find(item => item.id === id);
        if (existe) {
            existe.cantidad += cantidad;
        } else {
            itemsVenta.push({
                id: producto.id,
                nombre: producto.nombre,
                precio: precio,
                cantidad: cantidad
            });
        }
        
        app.renderListaVenta();
        app.actualizarTotales();
        app.limpiarBusquedaVenta();
    } else {
        app.showToast('❌ Sin stock suficiente', 'error');
    }
}
// ✅ Limpiar búsqueda
limpiarBusquedaVenta() {
    document.getElementById('ventaSearch').value = '';
    document.getElementById('ventaCantidadInput').value = '1';
    app.ocultarDropdown();
}

// ✅ Ocultar dropdown
ocultarDropdown(e) {
    if (e && e.target.id === 'ventaSearch') return;
    const dropdown = document.getElementById('productosDropdown');
    if (dropdown) {
        dropdown.style.display = 'none';
    }
}
renderListaVenta() {
    const container = document.getElementById('ventaItemsList');
    
    if (itemsVenta.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div style="font-size: 1.2rem; margin-bottom: 10px;">📦 Carrito vacío</div>
                <div style="color: #666;">🔍 Busca productos y selecciona para agregar</div>
            </div>
        `;
        return;
    }
    
    container.innerHTML = itemsVenta.map(item => {
        const producto = app.products.find(p => p.id === item.id);
        const stockDisponible = producto ? producto.cantidad : 0;
        const precioTotal = (item.precio * item.cantidad).toFixed(2);
        
        return `
            <div class="venta-item-row" data-id="${item.id}">
                <!-- NOMBRE -->
                <div class="item-nombre" style="flex: 2; font-weight: 600; font-size: 0.95rem;">
                    ${item.nombre}
                </div>
                
                <!-- UNIDADES - INPUT EDITABLE -->
                <input type="number" class="item-cantidad-editable" value="${item.cantidad}" 
                       min="1" max="${stockDisponible}" 
                       onchange="app.actualizarCantidadVenta(${item.id}, this.value)"
                       style="width: 60px; text-align: center; font-weight: 700; padding: 8px 4px; border: 2px solid #2196F3; border-radius: 8px; font-size: 1rem;">
                
                <!-- STOCK DISPONIBLE -->
                <div class="item-stock" style="font-size: 0.85rem; color: #666; min-width: 80px; text-align: center;">
                    Stock: ${stockDisponible}
                </div>
                
                <!-- PRECIO TOTAL -->
                <div class="item-precio" style="font-weight: 700; font-size: 1.1rem; color: #2e7d32; text-align: right; min-width: 80px;" id="precio-${item.id}">
                    $${precioTotal}
                </div>
                
                <!-- BORRAR -->
                <button class="btn-item-delete" onclick="app.eliminarItemVenta(${item.id})" title="Eliminar">
                    🗑️
                </button>
            </div>
        `;
    }).join('');
    
    this.actualizarTotales();
}
// ✅ Actualizar cantidad - CON VALIDACIÓN
actualizarCantidadVenta(id, nuevaCantStr) {
    const nuevaCant = parseInt(nuevaCantStr);
    if (isNaN(nuevaCant) || nuevaCant < 1) {
        app.showToast('❌ Cantidad mínima: 1', 'error');
        return;
    }
    
    const item = itemsVenta.find(item => item.id === id);
    const producto = app.products.find(p => p.id === id);
    
    if (!item || !producto) return;
    
    if (nuevaCant > producto.cantidad) {
        app.showToast(`❌ Máximo ${producto.cantidad} disponibles`, 'error');
        // Reset al máximo disponible
        document.querySelector(`[data-id="${id}"] .item-cantidad-editable`).value = producto.cantidad;
        item.cantidad = producto.cantidad;
    } else {
        item.cantidad = nuevaCant;
        app.renderListaVenta();  // ← Re-render para actualizar precio
        app.actualizarTotales();
        console.log(`🔄 ${item.nombre}: ${nuevaCant}`);
    }
}
// ✅ Eliminar item
eliminarItemVenta(id) {
    itemsVenta = itemsVenta.filter(item => item.id !== id);
    this.renderListaVenta();
    this.actualizarTotales();
}
actualizarTotales() {
    const total = itemsVenta.reduce((sum, item) => sum + (item.precio * item.cantidad), 0);
    const itemsCount = itemsVenta.reduce((sum, item) => sum + item.cantidad, 0);
    
    document.getElementById('subtotal').textContent = total.toFixed(2);
    document.getElementById('granTotal').textContent = total.toFixed(2);
    document.getElementById('itemsCount').textContent = itemsCount;
    
    document.getElementById('btnRealizarVentaMulti').disabled = itemsVenta.length === 0;
    document.getElementById('btnRealizarVentaMulti').textContent = 
        itemsVenta.length ? `✅ Vender ${itemsCount} items` : '❌ Sin items';
}

async procesarVentaMulti() {
    const btnVenta = document.getElementById('btnRealizarVentaMulti');
    if (btnVenta.disabled || itemsVenta.length === 0) return;
    
    btnVenta.disabled = true;
    btnVenta.innerHTML = '⏳ Finalizando...';
    
    try {
        const cliente = document.getElementById('clienteNombre').value.trim() || 'Cliente';
        const telefono = document.getElementById('clienteTelefono').value.trim();
        const metodoPago = document.getElementById('metodoPagoMulti').value;
        
        // 1. Verificar stock de todos los productos primero
        for (const item of itemsVenta) {
            const producto = this.products.find(p => p.id === item.id);
            if (!producto || item.cantidad > (producto.cantidad || 0)) {
                throw new Error(`Stock insuficiente para: ${item.nombre}`);
            }
        }
        
        // 2. Si todo está ok, restar inventario
        for (const item of itemsVenta) {
            const producto = this.products.find(p => p.id === item.id);
            const nuevoStock = producto.cantidad - item.cantidad;
            await this.updateProduct(item.id, { cantidad: nuevoStock });
        }
        
        // 3. Generar recibo único
        const total = itemsVenta.reduce((sum, item) => sum + (item.precio * item.cantidad), 0);
        this.generarReciboMultiSimple(itemsVenta, cliente, telefono, total, metodoPago);
        
        // 4. Limpiar carrito y cerrar panel
        itemsVenta = [];
        this.cancelarVentaMulti();
        document.getElementById('salesSection').classList.remove('active');
        
        this.showToast('✅ Venta procesada con éxito');
        
    } catch (error) {
        console.error('❌ Error:', error);
        this.showToast(error.message, 'error');
        btnVenta.disabled = false;
        btnVenta.innerHTML = '✅ Procesar Venta';
    }
}

cancelarVentaMulti() {
    itemsVenta = [];
    // Solo limpiar elementos que REALMENTE existen en tu HTML
    if(document.getElementById('clienteNombre')) document.getElementById('clienteNombre').value = '';
    if(document.getElementById('clienteTelefono')) document.getElementById('clienteTelefono').value = '';
    if(document.getElementById('ventaSearch')) document.getElementById('ventaSearch').value = '';
    if(document.getElementById('ventaCantidadInput')) document.getElementById('ventaCantidadInput').value = '1';
    if(document.getElementById('metodoPagoMulti')) document.getElementById('metodoPagoMulti').value = 'efectivo';
    
    this.renderListaVenta();
    this.actualizarTotales();
}
// ✅ Agregar item manual
agregarItemVenta() {
    const search = document.getElementById('ventaSearch').value.trim().toLowerCase();
    const cantidad = parseInt(document.getElementById('ventaCantidadInput').value) || 1;
    
    const producto = this.products.find(p => 
        p.nombre.toLowerCase().includes(search)
    );
    
    if (producto && cantidad <= producto.cantidad) {
        this.seleccionarProductoVenta(producto.id, producto.precio || 0);
    } else {
        this.showToast('❌ Producto no encontrado o sin stock', 'error');
    }
}
// ✅ updateVentaProductos - SIEMPRE CARGA
updateVentaProductos(search = '') {
    const select = document.getElementById('ventaProducto');
    select.innerHTML = '<option value="">🔍 Buscando...</option>';
    
    setTimeout(() => {
        const filtered = this.products
            .filter(p => !search || p.nombre.toLowerCase().includes(search.toLowerCase()))
            .slice(0, 100);
        
        select.innerHTML = '<option value="">Selecciona producto...</option>';
        
        filtered.forEach(p => {
            const option = document.createElement('option');
            option.value = p.id;
            option.textContent = `${p.nombre} | Stock: ${p.cantidad || 0} | $${(p.precio || 0).toFixed(2)}`;
            select.appendChild(option);
        });
        
        this.updateVentaTotal();
    }, 10);
}

// ✅ updateVentaTotal SIMPLIFICADA
updateVentaTotal() {
    const select = document.getElementById('ventaProducto');
    const cantidad = parseInt(document.getElementById('ventaCantidad').value) || 0;
    const producto = select ? this.products.find(p => p.id == select.value) : null;
    
    const total = producto ? (producto.precio || 0) * cantidad : 0;
    document.getElementById('ventaTotal').textContent = total.toFixed(2);
    
    const btn = document.getElementById('btnRealizarVenta');
    const stockOk = producto ? cantidad <= producto.cantidad : false;
    btn.disabled = !select.value || cantidad <= 0 || !stockOk;
    btn.textContent = stockOk ? '✅ Vender' : '❌ Stock insuficiente';
}

// Función auxiliar para crear warning de stock
crearStockWarning() {
    const warning = document.createElement('div');
    warning.id = 'stockWarning';
    warning.style.cssText = 'font-size: 0.9rem; margin-top: 5px; font-weight: 500;';
    document.querySelector('.total-section').appendChild(warning);
    return warning;
}
// ✅ realizarVenta - ANTI-DUPLICACIÓN
async realizarVenta() {
    const btnVenta = document.getElementById('btnRealizarVenta');
    if (btnVenta.disabled || btnVenta.textContent.includes('procesando')) {
        console.log('⏳ Venta en proceso, ignorando...');
        return;
    }
    
    console.log('🔄 Iniciando venta ÚNICA...');
    
    // ✅ BLOQUEAR BOTÓN
    btnVenta.disabled = true;
    btnVenta.textContent = '⏳ Procesando...';
    
    try {
        const productoId = parseInt(document.getElementById('ventaProducto').value);
        const cantidad = parseInt(document.getElementById('ventaCantidad').value);
        const cliente = document.getElementById('clienteNombre').value.trim() || 'Cliente';
        const telefono = document.getElementById('clienteTelefono').value.trim();
        const metodo = document.getElementById('metodoPago').value;
        
        const producto = this.products.find(p => p.id === productoId);
        if (!producto || cantidad > producto.cantidad) {
            throw new Error('Stock insuficiente');
        }
        
        // RESTAR INVENTARIO
        const nuevoStock = producto.cantidad - cantidad;
        await this.updateProduct(productoId, { cantidad: nuevoStock });
        
        // RECIBO
        this.generarReciboWhatsApp(producto, cantidad, metodo, cliente, telefono);
        
        this.cancelarVenta();
        document.getElementById('salesSection').classList.remove('active');
        
        console.log('✅ Venta completada SIN duplicados');
        
    } catch (error) {
        console.error('❌ Error venta:', error);
        this.showToast(error.message || 'Error en venta', 'error');
    } finally {
        // ✅ RE-HABILITAR BOTÓN
        btnVenta.disabled = false;
        btnVenta.textContent = '✅ Vender';
    }
}
generarReciboMultiSimple(items, cliente, telefonoInput = '', total, metodoPago = 'efectivo') {
    const fecha = new Date().toLocaleString('es-ES');
    // Limpiamos el teléfono o usamos uno por defecto
    const telefonoLimpio = String(telefonoInput).replace(/[^0-9]/g, '') || '';
    const pagoTexto = metodoPago === 'efectivo' ? '💵 EFECTIVO' : '💳 TRANSFERENCIA';
    
    let mensaje = `🧾 *TICKET DE VENTA*\n\n`;
    mensaje += `👤 Cliente: ${cliente}\n`;
    mensaje += `📅 Fecha: ${fecha}\n`;
    mensaje += `💳 Pago: ${pagoTexto}\n\n`;
    mensaje += `PRODUCTOS:\n`;
    mensaje += `────────────────────\n`;
    
    items.forEach(item => {
        const subtotalItem = item.precio * item.cantidad;
        const cantTxt = String(item.cantidad).padStart(2, ' '); 
        mensaje += `${item.nombre.padEnd(20)} x${cantTxt} $${subtotalItem.toFixed(2)}\n`;
    });
    
    mensaje += `────────────────────\n`;
    mensaje += `TOTAL: $${total.toFixed(2)}\n\n`;
    mensaje += `¡Gracias por tu compra! 🛒`;
    
    const reciboHTML = `
        <div class="recibo active" id="recibo-actual">
            <div class="recibo-header">
                <h2>🧾 TICKET ${cliente}</h2>
                <p>${fecha}</p>
            </div>
            <div class="recibo-body">
                <div style="margin-bottom: 15px;">
                    <strong>Pago:</strong> <span style="color: ${metodoPago === 'efectivo' ? '#4CAF50' : '#2196F3'}">${pagoTexto}</span>
                </div>
                ${items.map(item => `
                    <div style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee;">
                        <span>${item.nombre}</span>
                        <span style="text-align: right;">x${item.cantidad}</span>
                        <strong>$${(item.precio * item.cantidad).toFixed(2)}</strong>
                    </div>
                `).join('')}
                <hr>
                <div style="text-align: right; font-size: 1.4rem; color: #2e7d32; padding-top: 15px;">
                    TOTAL: <strong>$${total.toFixed(2)}</strong>
                </div>
            </div>
            <div class="recibo-footer">
                <button class="btn-print whatsapp-btn" 
        onclick="window.enviarWhatsApp('${encodeURIComponent(mensaje)}', '${telefonoLimpio}')">
    📱 WhatsApp
</button>
                <button class="btn-print" onclick="window.print()">🖨️ Imprimir</button>
                <button class="btn-print secondary" onclick="this.closest('.recibo').remove()">Cerrar</button>
            </div>
        </div>
    `;
    
    // Eliminar recibos anteriores antes de mostrar el nuevo
    document.querySelectorAll('.recibo').forEach(el => el.remove());
    document.body.insertAdjacentHTML('beforeend', reciboHTML);
}


// ✅ procesarVentaMulti - CALL CORRECTO
async procesarVentaMulti() {
    console.log('🔄 Iniciando procesarVentaMulti...');
    
    const btnVenta = document.getElementById('btnRealizarVentaMulti');
    btnVenta.disabled = true;
    btnVenta.textContent = '⏳ Finalizando...';
    
    try {
        const cliente = document.getElementById('clienteNombre').value.trim() || 'Cliente';
        const telefono = document.getElementById('clienteTelefono').value.trim();
        
        // Verificar stock
        for (const item of itemsVenta) {
            const producto = this.products.find(p => p.id === item.id);
            if (item.cantidad > (producto?.cantidad || 0)) {
                this.showToast(`${producto.nombre}: sin stock`, 'error');
                return;
            }
        }
        
        // Restar inventario
        for (const item of itemsVenta) {
            const nuevoStock = this.products.find(p => p.id === item.id).cantidad - item.cantidad;
            await this.updateProduct(item.id, { cantidad: nuevoStock });
        }
        
        // ✅ TOTAL SIMPLE
        const total = itemsVenta.reduce((sum, item) => sum + (item.precio * item.cantidad), 0);
        
        // ✅ RECIBO - FUNCIÓN CORRECTA
        this.generarReciboMultiSimple(itemsVenta, cliente, telefono, total);
        
    } catch (error) {
        console.error('❌ Error venta multi:', error);
        this.showToast('Error procesando venta', 'error');
    } finally {
        // ✅ CIERRE TOTAL
        itemsVenta = [];
        this.cancelarVentaMulti();
        
        // Doble cierre
        const panel = document.getElementById('salesSection');
        panel.classList.remove('active');
        panel.style.display = 'none';
        
        btnVenta.disabled = false;
        btnVenta.textContent = '✅ Listo';
        
        setTimeout(() => {
            panel.style.display = 'flex';
        }, 500);
    }
}

// ✅ FUNCIONES AUXILIARES
cerrarVentas() {
    document.getElementById('salesSection').classList.remove('active');
}

 // ✅ cancelarVenta MEJORADA
cancelarVenta() {
    console.log('🧹 Limpiando formulario ventas...');
    
    // Limpiar TODOS los campos
    document.getElementById('clienteNombre').value = '';
    document.getElementById('clienteTelefono').value = '';
    document.getElementById('ventaSearch').value = '';
    document.getElementById('ventaProducto').value = '';
    document.getElementById('ventaCantidad').value = '1';
    document.getElementById('metodoPago').value = 'efectivo';
    document.getElementById('ventaTotal').textContent = '0.00';
    
    // Reset botones
    const btnVenta = document.getElementById('btnRealizarVenta');
    btnVenta.disabled = true;
    btnVenta.textContent = '❌ Selecciona producto';
    
    // Reset warning
    const warning = document.getElementById('stockWarning');
    if (warning) warning.textContent = '';
    
    // Recargar productos
    this.updateVentaProductos();
    
    console.log('✅ Formulario limpio');
}
// ✅ toggleVentas - Prevenir múltiples aperturas
toggleVentas() {
    const section = document.getElementById('salesSection');
    if (section.classList.contains('active')) {
        section.classList.remove('active');
    } else {
        section.classList.add('active');
        // Focus después de animación
        setTimeout(() => {
            document.getElementById('ventaSearch').focus();
            this.updateVentaProductos();
        }, 250);
    }
}
    generarRecibo(producto, cantidad, metodo) {
        const total = (producto.precio || 0) * cantidad;
        const fecha = new Date().toLocaleString('es-ES');
        const reciboHTML = `
            <div class="recibo active">
                <div class="recibo-header">
                    <h2>🧾 RECIBO</h2>
                    <p>${fecha}</p>
                </div>
                <div class="recibo-body">
                    <div class="recibo-item"><span>${producto.nombre}</span><span>x${cantidad}</span></div>
                    <div class="recibo-item"><span>Precio</span><span>$${producto.precio?.toFixed(2)}</span></div>
                    <div class="recibo-total">TOTAL: $${total.toFixed(2)}</div>
                    <div style="margin-top:20px;padding-top:20px;border-top:2px dashed #eee;">
                        <strong>Pago:</strong> ${metodo === 'efectivo' ? '💵 EFECTIVO' : '💳 TRANSFERENCIA'}
                    </div>
                </div>
                <div class="recibo-footer">
                    <button class="btn-print" onclick="window.print()">🖨️ Imprimir</button>
                    <button class="btn-print secondary" onclick="this.closest('.recibo').classList.remove('active')">Cerrar</button>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', reciboHTML);
    }

// ✅ Modal Editar CORREGIDO
setupEditModal() {
    document.getElementById('closeEditModal').onclick = () => {
        document.getElementById('editModal').classList.remove('active');
    };
    
    document.getElementById('btnGuardarEdit').onclick = () => {
        const qty = parseInt(document.getElementById('editCantidad').value) || 0;
        if (window.currentEditId !== undefined) {
            app.updateProduct(window.currentEditId, { cantidad: qty });
        }
        document.getElementById('editModal').classList.remove('active');
    };
    
    document.getElementById('btnCancelarEdit').onclick = () => {
        document.getElementById('editModal').classList.remove('active');
    };
}

    async deleteProduct(id) {
        if (!confirm('¿Eliminar producto?')) return;
        
        this.products = this.products.filter(p => p.id !== id);
        if (this.db) {
            try {
                const tx = this.db.transaction([this.STORE_NAME], 'readwrite');
                const store = tx.objectStore(this.STORE_NAME);
                await new Promise(r => {
                    store.delete(id).onsuccess = r;
                });
            } catch (e) {}
        }
        this.saveToLocalStorage();
        this.renderProducts();
        this.updateStats();
    }

    updateStats() {
        const total = this.products.length;
        const low = this.products.filter(p => (p.cantidad || 0) <= (p.stockMin || 0)).length;
        document.getElementById('totalItems').textContent = `Total: ${total}`;
        document.getElementById('lowStock').textContent = `Bajo stock: ${low}`;
    }

    showToast(msg, type = 'success') {
        const toast = document.getElementById('toast');
        toast.textContent = msg;
        toast.className = `toast show ${type}`;
        setTimeout(() => toast.classList.remove('show'), 2500);
    }
}

function debounce(fn, ms) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), ms);
    };
}

const app = new InventarioApp();
// ✅ WhatsApp con número por defecto
// Al final de tu script.js, asegúrate de que se vea así:
// ✅ Coloca esto al final de tu script.js
window.enviarWhatsApp = function(mensaje, telefonoRaw) {
    // Limpieza de número
    let numeroLimpio = String(telefonoRaw).replace(/[^0-9]/g, '');
    
    // Si no hay número, lo pedimos (Útil si el input estaba vacío)
    if (!numeroLimpio || numeroLimpio.length < 7) {
        const nuevoTel = prompt("Ingresa el número de WhatsApp (ej: 4121234567):");
        if (!nuevoTel) return;
        numeroLimpio = nuevoTel.replace(/[^0-9]/g, '');
    }

    // Asegurar código de país (58 para Venezuela)
    const numeroFinal = numeroLimpio.startsWith('58') ? numeroLimpio : '58' + numeroLimpio;
    
    // Crear URL de WhatsApp Desktop / Web
    const url = `https://wa.me/${numeroFinal}?text=${mensaje}`;
    
    console.log('📱 Intentando abrir WhatsApp:', numeroFinal);

    // Intentar abrir la ventana
    const nuevaVentana = window.open(url, '_blank', 'noopener,noreferrer');
    
    // Si el navegador bloqueó el popup, avisamos al usuario
    if (!nuevaVentana || nuevaVentana.closed || typeof nuevaVentana.closed === 'undefined') {
        alert("⚠️ El navegador bloqueó la ventana. Por favor, permite los 'Pop-ups' (ventanas emergentes) para este sitio.");
    }
};
// ✅ Array global de items venta
let itemsVenta = [];
