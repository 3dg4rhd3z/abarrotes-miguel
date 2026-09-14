document.addEventListener('DOMContentLoaded', () => {
    // Referencias DOM principales
    const loginView = document.getElementById('login-view');
    const mainLayout = document.getElementById('main-layout');
    const loginForm = document.getElementById('login-form');
    const loginError = document.getElementById('login-error');
    const logoutBtn = document.getElementById('logout-btn');
    const currentUserRoleBadge = document.getElementById('current-user-role');
    const navBtns = document.querySelectorAll('.nav-btn');
    const subViews = document.querySelectorAll('.sub-view');
    
    // Elementos Móvil
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const sidebar = document.getElementById('sidebar');
    
    // --- Autenticación ---
    async function checkAuth() {
        const user = db.getCurrentUser();
        if (user) {
            showMainLayout(user);
        }
    }

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const userInp = document.getElementById('username').value.trim();
        const passInp = document.getElementById('password').value;
        const btn = loginForm.querySelector('button');
        
        btn.disabled = true;
        btn.textContent = "Conectando...";
        
        const user = await db.login(userInp, passInp);
        
        btn.disabled = false;
        btn.textContent = "Iniciar Sesión";
        
        if (user) {
            loginError.classList.add('hidden');
            showMainLayout(user);
        } else {
            loginError.classList.remove('hidden');
        }
    });

    logoutBtn.addEventListener('click', () => {
        db.logout();
        mainLayout.classList.add('hidden');
        loginView.classList.remove('hidden');
        document.getElementById('password').value = '';
    });

    function showMainLayout(user) {
        loginView.classList.add('hidden');
        mainLayout.classList.remove('hidden');
        currentUserRoleBadge.textContent = user.role === 'admin' ? 'Administrador' : 'Cajero';
        
        // Control de accesos
        document.querySelectorAll('.admin-only').forEach(el => {
            el.style.display = user.role === 'admin' ? 'block' : 'none';
        });
        
        // Refrescar vistas
        refreshCatalog();
        if(user.role === 'admin') refreshUsers();
    }

    // --- Navegación ---
    navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            navBtns.forEach(b => b.classList.remove('active'));
            subViews.forEach(v => v.classList.add('hidden'));
            
            btn.classList.add('active');
            const targetId = btn.getAttribute('data-target');
            document.getElementById(targetId).classList.remove('hidden');
            
            // Auto focus
            if (targetId === 'pos-view') setTimeout(() => document.getElementById('pos-barcode-input').focus(), 100);
            if (targetId === 'price-checker-view') setTimeout(() => document.getElementById('checker-barcode-input').focus(), 100);
            
            // Cerrar sidebar en móvil
            sidebar.classList.remove('open');
        });
    });
    
    mobileMenuBtn.addEventListener('click', () => {
        sidebar.classList.toggle('open');
    });

    // --- Lógica HID Barcode Scanner Global ---
    // Si el usuario teclea rápido (scanner HID) y no está en un input, enfocamos el buscador POS
    let barcodeBuffer = "";
    let lastKeyTime = Date.now();
    
    window.addEventListener('keypress', (e) => {
        const tag = e.target.tagName.toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select') return; // Si ya está en un input, ignorar
        
        const currentTime = Date.now();
        if (currentTime - lastKeyTime > 50) {
            barcodeBuffer = ""; // Reset si pasó mucho tiempo (escribió a mano)
        }
        
        if (e.key === 'Enter') {
            if (barcodeBuffer.length > 3) {
                // Forzar proceso de escaneo en la vista actual
                const activeViewId = document.querySelector('.sub-view.active').id;
                if (activeViewId === 'pos-view') {
                    document.getElementById('pos-barcode-input').value = barcodeBuffer;
                    processPosBarcode(barcodeBuffer);
                } else if (activeViewId === 'price-checker-view') {
                    document.getElementById('checker-barcode-input').value = barcodeBuffer;
                    processCheckerBarcode(barcodeBuffer);
                }
                barcodeBuffer = "";
            }
        } else {
            barcodeBuffer += e.key;
        }
        lastKeyTime = currentTime;
    });

    // --- Punto de Venta (POS) ---
    let posCart = [];
    const posInput = document.getElementById('pos-barcode-input');
    const posTableBody = document.getElementById('pos-items');
    const posEmptyState = document.getElementById('pos-empty-state');
    const posSubtotal = document.getElementById('pos-subtotal');
    const posTotal = document.getElementById('pos-total');
    const btnCheckout = document.getElementById('btn-checkout');
    const amountReceivedInp = document.getElementById('amount-received');
    const posChange = document.getElementById('pos-change');

    posInput.addEventListener('keypress', async (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const code = posInput.value.trim();
            if (code) {
                await processPosBarcode(code);
                posInput.value = '';
            }
        }
    });
    
    async function processPosBarcode(code) {
        const product = await db.getProductByCode(code);
        if (product) {
            const existingItem = posCart.find(i => i.product.code === product.code);
            if (existingItem) {
                existingItem.quantity++;
            } else {
                posCart.push({ product, quantity: 1 });
            }
            renderPosCart();
        } else {
            alert('Producto no encontrado en la base de datos.');
        }
    }

    function renderPosCart() {
        posTableBody.innerHTML = '';
        let total = 0;

        if (posCart.length === 0) {
            posEmptyState.style.display = 'block';
            document.getElementById('pos-table').style.display = 'none';
            btnCheckout.disabled = true;
        } else {
            posEmptyState.style.display = 'none';
            document.getElementById('pos-table').style.display = 'table';
            btnCheckout.disabled = false;

            posCart.forEach(item => {
                const rowTotal = item.product.price * item.quantity;
                total += rowTotal;
                
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>
                        <div style="font-weight: 600;">${item.product.name}</div>
                        <div style="font-size: 0.8rem; color: var(--text-muted);">${item.product.code}</div>
                    </td>
                    <td>
                        <input type="number" class="qty-input" value="${item.quantity}" min="1" data-code="${item.product.code}">
                    </td>
                    <td>$${item.product.price.toFixed(2)}</td>
                    <td style="font-weight: 600;">$${rowTotal.toFixed(2)}</td>
                    <td>
                        <button class="btn-remove-cat" data-code="${item.product.code}">❌</button>
                    </td>
                `;
                posTableBody.appendChild(tr);
            });
        }

        posSubtotal.textContent = `$${total.toFixed(2)}`;
        posTotal.textContent = `$${total.toFixed(2)}`;
        calculateChange();

        // Listeners for inputs/buttons inside table
        document.querySelectorAll('.qty-input').forEach(inp => {
            inp.addEventListener('change', (e) => {
                const code = e.target.getAttribute('data-code');
                const newQty = parseInt(e.target.value);
                const cartItem = posCart.find(i => i.product.code === code);
                if (cartItem && newQty > 0) {
                    cartItem.quantity = newQty;
                    renderPosCart();
                }
            });
        });

        document.querySelectorAll('#pos-items .btn-remove-cat').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const code = e.currentTarget.getAttribute('data-code');
                posCart = posCart.filter(i => i.product.code !== code);
                renderPosCart();
            });
        });
    }

    amountReceivedInp.addEventListener('input', calculateChange);

    function calculateChange() {
        const totalStr = posTotal.textContent.replace('$', '');
        const total = parseFloat(totalStr) || 0;
        const received = parseFloat(amountReceivedInp.value) || 0;
        const change = received - total;

        if (change >= 0 && posCart.length > 0) {
            posChange.textContent = `$${change.toFixed(2)}`;
            posChange.style.color = 'var(--success-color)';
        } else {
            posChange.textContent = '$0.00';
            posChange.style.color = 'var(--text-main)';
        }
    }

    btnCheckout.addEventListener('click', async () => {
        const totalStr = posTotal.textContent.replace('$', '');
        const total = parseFloat(totalStr);
        
        btnCheckout.disabled = true;
        btnCheckout.textContent = "Procesando...";
        
        const success = await db.registerSale(posCart.map(i => ({ code: i.product.code, quantity: i.quantity, price: i.product.price })), total);
        if (success) {
            alert('¡Venta registrada con éxito!');
            posCart = [];
            amountReceivedInp.value = '';
            renderPosCart();
            refreshCatalog();
        } else {
            alert('Error al procesar la venta. Inténtalo de nuevo.');
        }
        btnCheckout.disabled = false;
        btnCheckout.textContent = "Finalizar Venta";
        posInput.focus();
    });

    // --- Checador ---
    const checkerInput = document.getElementById('checker-barcode-input');
    const checkerResult = document.getElementById('checker-result');
    const checkerNotFound = document.getElementById('checker-not-found');

    checkerInput.addEventListener('keypress', async (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const code = checkerInput.value.trim();
            if (code) {
                await processCheckerBarcode(code);
                checkerInput.value = '';
            }
        }
    });
    
    async function processCheckerBarcode(code) {
        checkerResult.classList.add('hidden');
        checkerNotFound.classList.add('hidden');
        
        const product = await db.getProductByCode(code);
        if (product) {
            document.getElementById('checker-name').textContent = product.name;
            document.getElementById('checker-price').textContent = `$${product.price.toFixed(2)}`;
            document.getElementById('checker-stock-val').textContent = product.stock;
            checkerResult.classList.remove('hidden');
        } else {
            checkerNotFound.classList.remove('hidden');
        }
    }

    // --- Catálogo (Admin) ---
    const catalogTableBody = document.getElementById('catalog-items');
    
    async function refreshCatalog() {
        if (!db.getCurrentUser() || db.getCurrentUser().role !== 'admin') return;
        
        const products = await db.getProducts();
        catalogTableBody.innerHTML = '';
        
        const searchVal = document.getElementById('catalog-search').value.toLowerCase();
        
        products.filter(p => p.name.toLowerCase().includes(searchVal) || p.code.includes(searchVal)).forEach(p => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="font-family: monospace; color: var(--text-muted);">${p.code}</td>
                <td>${p.name}</td>
                <td>
                    <div class="editable-price" data-code="${p.code}" title="Clic para editar">$${p.price.toFixed(2)}</div>
                </td>
                <td>
                    <span class="badge ${p.stock <= 5 ? 'danger' : ''}">${p.stock}</span>
                </td>
                <td class="item-actions">
                    <button class="btn-edit" data-code="${p.code}" title="Editar Todo">✏️</button>
                    <button class="btn-remove-cat" data-code="${p.code}" title="Eliminar">❌</button>
                </td>
            `;
            catalogTableBody.appendChild(tr);
        });

        // Eventos Editar rápido precio
        document.querySelectorAll('.editable-price').forEach(el => {
            el.addEventListener('click', function() {
                const currentPrice = parseFloat(this.textContent.replace('$', ''));
                this.innerHTML = `<input type="number" class="editing-input" value="${currentPrice}" step="0.01" min="0">`;
                const input = this.querySelector('input');
                input.focus();
                
                const saveInline = async () => {
                    const code = this.getAttribute('data-code');
                    const newPrice = parseFloat(input.value);
                    if (!isNaN(newPrice)) {
                        this.innerHTML = "Guardando...";
                        const p = await db.getProductByCode(code);
                        p.price = newPrice;
                        await db.saveProduct(p);
                        refreshCatalog();
                    }
                };

                input.addEventListener('blur', saveInline);
                input.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        input.blur();
                    }
                });
            });
        });

        // Eventos modal
        document.querySelectorAll('.btn-edit').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const code = e.currentTarget.getAttribute('data-code');
                const p = await db.getProductByCode(code);
                if (p) {
                    document.getElementById('prod-original-code').value = p.code;
                    document.getElementById('prod-code').value = p.code;
                    document.getElementById('prod-name').value = p.name;
                    document.getElementById('prod-price').value = p.price;
                    document.getElementById('prod-stock').value = p.stock;
                    document.getElementById('modal-title').textContent = 'Editar Producto';
                    document.getElementById('product-modal').classList.remove('hidden');
                }
            });
        });

        // Borrar
        document.querySelectorAll('#catalog-items .btn-remove-cat').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const code = e.currentTarget.getAttribute('data-code');
                if(confirm('¿Seguro que deseas eliminar este producto?')) {
                    await db.deleteProduct(code);
                    refreshCatalog();
                }
            });
        });
    }

    document.getElementById('catalog-search').addEventListener('input', refreshCatalog);

    // Add Product
    document.getElementById('btn-add-product').addEventListener('click', () => {
        document.getElementById('product-form').reset();
        document.getElementById('prod-original-code').value = '';
        document.getElementById('modal-title').textContent = 'Nuevo Producto';
        document.getElementById('product-modal').classList.remove('hidden');
    });

    document.getElementById('product-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const code = document.getElementById('prod-code').value.trim();
        const originalCode = document.getElementById('prod-original-code').value;
        const name = document.getElementById('prod-name').value.trim();
        const price = parseFloat(document.getElementById('prod-price').value);
        const stock = parseInt(document.getElementById('prod-stock').value);

        if (originalCode && originalCode !== code) {
            // Si cambió el código, borrar viejo y guardar nuevo (simplificación)
            await db.deleteProduct(originalCode);
        }

        await db.saveProduct({ code, name, price, stock });
        document.getElementById('product-modal').classList.add('hidden');
        refreshCatalog();
    });
    
    // --- Gestión de Usuarios ---
    const usersTableBody = document.getElementById('users-items');
    
    async function refreshUsers() {
        const users = await db.getUsers();
        usersTableBody.innerHTML = '';
        users.forEach(u => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${u.username} ${u.username === 'admin' ? '🛡️' : ''}</td>
                <td style="text-transform: capitalize;">${u.role}</td>
                <td>
                    ${u.username !== 'admin' ? `<button class="btn-remove-cat" data-user="${u.username}" title="Eliminar">❌</button>` : ''}
                </td>
            `;
            usersTableBody.appendChild(tr);
        });
        
        document.querySelectorAll('#users-items .btn-remove-cat').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const un = e.currentTarget.getAttribute('data-user');
                if(confirm(`¿Seguro que deseas eliminar al usuario ${un}?`)) {
                    await db.deleteUser(un);
                    refreshUsers();
                }
            });
        });
    }
    
    document.getElementById('btn-add-user').addEventListener('click', () => {
        document.getElementById('user-form').reset();
        document.getElementById('user-modal').classList.remove('hidden');
    });
    
    document.getElementById('user-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const u = document.getElementById('user-username').value.trim();
        const p = document.getElementById('user-password').value.trim();
        const r = document.getElementById('user-role').value;
        await db.saveUser(u, p, r);
        document.getElementById('user-modal').classList.add('hidden');
        refreshUsers();
    });

    // --- Backups ---
    document.getElementById('btn-backup-download').addEventListener('click', async () => {
        const btn = document.getElementById('btn-backup-download');
        btn.textContent = "Generando...";
        const data = await db.createBackup();
        if (data) {
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `respaldo_abarrotes_${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            URL.revokeObjectURL(url);
        } else {
            alert('Error generando respaldo.');
        }
        btn.textContent = "Descargar Respaldo JSON";
    });
    
    document.getElementById('btn-backup-restore').addEventListener('click', () => {
        const fileInput = document.getElementById('backup-file-input');
        if (!fileInput.files.length) return alert('Selecciona un archivo .json primero');
        
        const file = fileInput.files[0];
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = JSON.parse(e.target.result);
                if(confirm('¿Estás SEGURO de restaurar este respaldo? Puede sobrescribir los datos actuales.')) {
                    const btn = document.getElementById('btn-backup-restore');
                    btn.textContent = "Restaurando...";
                    const ok = await db.restoreBackup(data);
                    if(ok) {
                        alert('Restauración completada con éxito.');
                        refreshCatalog();
                        refreshUsers();
                    } else {
                        alert('Hubo errores durante la restauración.');
                    }
                    btn.textContent = "Restaurar desde archivo";
                }
            } catch (err) {
                alert('El archivo no es válido.');
            }
        };
        reader.readAsText(file);
    });

    // Inicializar auth al cargar
    checkAuth();
});
