// --- CONSTANTS ---
const DEFAULT_DEPARTMENTS = [
    "Eagles", "Daughters of Faith", "Youth", 
    "Kingdom Generation", "Planning Committee", "Guests"
];
const DEPT_STORAGE_KEY = 'dcd_custom_departments';
const DB_KEY = 'dcd_possess_land_v19';

// --- SECURITY UTILS ---
function escapeHtml(unsafe) {
    if (!unsafe) return "";
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

function parseSafeFloat(val) {
    const num = parseFloat(val);
    return isNaN(num) || num < 0 ? 0 : num;
}

// --- DEPARTMENT MANAGER ---
const DeptManager = {
    list: [],

    init() {
        try {
            const stored = localStorage.getItem(DEPT_STORAGE_KEY);
            this.list = stored ? JSON.parse(stored) : [...DEFAULT_DEPARTMENTS];
        } catch (e) {
            console.error("Failed to load departments", e);
            this.list = [...DEFAULT_DEPARTMENTS];
            this.save();
        }
    },

    getAll() {
        return this.list;
    },

    ensureExists(name) {
        if (!name) return;
        name = name.trim();
        const exists = this.list.some(d => d.toLowerCase() === name.toLowerCase());
        
        if (!exists) {
            this.list.push(name);
            this.save();
            return true; 
        }
        return false; 
    },

    save() {
        localStorage.setItem(DEPT_STORAGE_KEY, JSON.stringify(this.list));
    },

    reset() {
        this.list = [...DEFAULT_DEPARTMENTS];
        this.save();
    }
};

// --- STORE ---
const store = {
    data: {
        pledges: [], 
        transactions: [], 
        expenses: [], 
        phases: [] 
    },

    init() {
        try {
            const saved = localStorage.getItem(DB_KEY);
            if (saved) {
                this.data = JSON.parse(saved);
            } else {
                // Initialize default phase if no data exists
                this.data.phases.push({
                    id: Date.now(),
                    name: "Initial Phase",
                    totalTarget: 1000000,
                    date: new Date().toISOString().split('T')[0],
                    deptTargets: {} 
                });
                this.save();
            }
        } catch (e) {
            console.error("Data corruption detected. Resetting.", e);
            this.hardResetInternal();
        }
    },

    save() {
        try {
            localStorage.setItem(DB_KEY, JSON.stringify(this.data));
            // Trigger UI update via app reference
            if(app && app.render) app.render();
        } catch (e) {
            if(app && app.showToast) app.showToast("Error saving data: Storage might be full.", 'error');
        }
    },

    addPledge(name, dept, amount) {
        const existing = this.data.pledges.find(p => 
            p.name.toLowerCase() === name.toLowerCase() &&
            p.department.toLowerCase() === dept.toLowerCase()
        );
        
        if (existing) {
            existing.amount += amount;
            this.save();
            return existing.id;
        } else {
            const id = Date.now().toString() + Math.random().toString(36).substr(2, 5);
            this.data.pledges.push({
                id,
                name,
                department: dept,
                amount: amount,
                date: new Date().toISOString()
            });
            this.save();
            return id;
        }
    },

    updatePledge(id, newData) {
        const index = this.data.pledges.findIndex(p => p.id === id);
        if (index > -1) {
            this.data.pledges[index] = { 
                ...this.data.pledges[index], 
                name: newData.name, 
                department: newData.department,
                amount: newData.amount
            };
            this.save();
        }
    },

    deletePledge(id) {
        const pledge = this.data.pledges.find(p => p.id === id);
        if (pledge) {
            const txCount = this.data.transactions.filter(t => t.pledgeId === id).length;
            if (txCount > 0) {
                const proceed = confirm(`This pledge has ${txCount} payments. Deleting it will remove them from ledger. Continue?`);
                if (!proceed) return;
            }
        }
        this.data.pledges = this.data.pledges.filter(p => p.id !== id);
        this.save();
    },

    addTransaction(tx) {
        this.data.transactions.unshift({
            id: Date.now().toString(),
            ...tx,
            date: new Date().toISOString()
        });
        this.save();
    },

    addExpense(desc, amount, category) {
        this.data.expenses.push({
            id: Date.now().toString(),
            description: desc,
            amount: amount,
            category,
            date: new Date().toISOString()
        });
        this.save();
    },

    addPhase(name, date, deptTargets) {
        const total = Object.values(deptTargets).reduce((a,b) => a+b, 0);
        this.data.phases.push({
            id: Date.now(),
            name, 
            totalTarget: total, 
            date,
            deptTargets
        });
        this.data.phases.sort((a,b) => new Date(a.date) - new Date(b.date));
        this.save();
    },

    deletePhase(id) {
        this.data.phases = this.data.phases.filter(p => p.id !== id);
        this.save();
    },

    hardResetInternal() {
        localStorage.removeItem(DB_KEY);
        location.reload();
    }
};

// --- APP CONTROLLER ---
window.app = {
    stagedTx: [],

    init() {
        DeptManager.init();
        store.init();
        this.populateDeptSelects();
        this.renderSettingsForm();
        this.render();
    },

    router(viewId) {
        document.querySelectorAll('main > section').forEach(el => el.classList.add('hidden'));
        document.getElementById(`view-${viewId}`).classList.remove('hidden');
        
        document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
        const map = { 'dashboard':0, 'pledges':1, 'ledger':2, 'expenses':3, 'tribes':4, 'settings':5 };
        const navItems = document.querySelectorAll('.nav-item');
        if(navItems[map[viewId]]) {
            navItems[map[viewId]].classList.add('active');
        }
    },

    openModal(type) {
        const el = document.getElementById(`modal-${type}`);
        if(el) el.classList.add('open');
    },

    // Helper to open Manual Cash modal pre-filled for a specific pledge
    openPaymentModal(pledgeId) {
        const pledge = store.data.pledges.find(p => p.id === pledgeId);
        if (!pledge) return;

        document.getElementById('cash-name').value = pledge.name;
        document.getElementById('cash-dept').value = pledge.department;
        document.getElementById('cash-amount').value = '';
        document.getElementById('cash-ref').value = '';
        
        this.openModal('manual-cash');
    },

    closeModal(type) {
        const el = document.getElementById(`modal-${type}`);
        if(el) el.classList.remove('open');
        if(type === 'sms-parse') {
            document.getElementById('sms-input').value = '';
            document.getElementById('staged-area').classList.add('hidden');
            document.getElementById('btn-parse-trigger').classList.remove('hidden');
            document.getElementById('btn-commit-trigger').classList.add('hidden');
            document.getElementById('btn-parse-trigger').innerText = "⚡ Extract Data";
            this.stagedTx = [];
        }
    },

    populateDeptSelects() {
        const depts = DeptManager.getAll();
        const opts = depts.map(d => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join('');
        
        ['modal-dept-select', 'edit-dept-select', 'cash-dept'].forEach(id => {
            const el = document.getElementById(id);
            if(el) el.innerHTML = opts;
        });

        this.renderSettingsForm();
        
        const names = [...new Set(store.data.pledges.map(p => p.name))];
        const memberList = document.getElementById('member-list');
        if(memberList) memberList.innerHTML = names.map(n => `<option value="${escapeHtml(n)}">`).join('');
    },

    renderSettingsForm() {
        const container = document.getElementById('dept-targets-container');
        if(container) {
            container.innerHTML = '';
            DeptManager.getAll().forEach(dept => {
                const div = document.createElement('div');
                div.className = 'form-group';
                div.innerHTML = `
                    <label>${escapeHtml(dept)} Target</label>
                    <input type="number" id="targ-${dept.replace(/\s/g, '')}" class="dept-target-input" placeholder="0" min="0" oninput="app.updateTotalPreview()">
                `;
                container.appendChild(div);
            });
        }
    },

    updateTotalPreview() {
        let total = 0;
        document.querySelectorAll('.dept-target-input').forEach(inp => total += Number(inp.value) || 0);
        const preview = document.getElementById('total-target-preview');
        if(preview) preview.innerText = this.formatMoney(total);
    },

    addPhaseFromForm(e) {
        e.preventDefault();
        const name = document.getElementById('phase-name').value;
        const date = document.getElementById('phase-date').value;
        
        const targets = {};
        DeptManager.getAll().forEach(dept => {
            const val = document.getElementById(`targ-${dept.replace(/\s/g, '')}`).value;
            targets[dept] = Number(val) || 0;
        });

        store.addPhase(name, date, targets);
        this.showToast('Phase created', 'success');
        document.getElementById('phase-form').reset();
        this.updateTotalPreview();
    },

    submitPledge(e) {
        e.preventDefault();
        const form = e.target;
        const amount = parseSafeFloat(form.amount.value);
        
        if(amount <= 0) {
            this.showToast("Amount must be greater than 0", "error");
            return;
        }

        store.addPledge(form.name.value, form.department.value, amount);
        this.closeModal('pledge');
        form.reset();
    },

    submitManualCash(e) {
        e.preventDefault();
        const name = document.getElementById('cash-name').value;
        const dept = document.getElementById('cash-dept').value;
        const amount = parseSafeFloat(document.getElementById('cash-amount').value);
        const ref = document.getElementById('cash-ref').value || 'Manual Cash';
        const timestamp = new Date(); 

        if(amount <= 0) {
            this.showToast("Amount must be greater than 0", "error");
            return;
        }

        const dupe = this.checkDuplicate(name, dept, amount, timestamp);
        if (dupe) {
            this.showToast(`Duplicate: Same amount from ${name} (${dept}) within 30 minutes.`, 'error');
            return;
        }

        let pledge = store.data.pledges.find(p => 
            p.name.toLowerCase() === name.toLowerCase() &&
            p.department.toLowerCase() === dept.toLowerCase()
        );
        
        if (!pledge) {
            const pid = store.addPledge(name, dept, amount);
            pledge = store.data.pledges.find(p => p.id === pid);
        }

        store.addTransaction({
            pledgeId: pledge.id,
            name: pledge.name,
            department: dept,
            amount: amount,
            type: 'credit',
            method: 'Cash',
            ref: ref,
            date: timestamp.toISOString()
        });

        this.closeModal('manual-cash');
        this.showToast('Payment recorded!', 'success');
        e.target.reset();
    },

    submitExpense(e) {
        e.preventDefault();
        const desc = document.getElementById('expense-desc').value;
        const amount = parseSafeFloat(document.getElementById('expense-amount').value);
        const category = document.getElementById('expense-category').value;

        if(amount <= 0) {
            this.showToast("Amount must be greater than 0", "error");
            return;
        }

        store.addExpense(desc, amount, category);
        this.closeModal('expense');
        e.target.reset();
        this.showToast('Expense recorded', 'error'); // Using error toast color for expenses visually
    },

    editPledge(id) {
        const pledge = store.data.pledges.find(p => p.id === id);
        if(!pledge) return;

        document.getElementById('edit-id').value = pledge.id;
        document.querySelector('#modal-edit-pledge [name="name"]').value = pledge.name;
        document.querySelector('#modal-edit-pledge [name="department"]').value = pledge.department;
        document.querySelector('#modal-edit-pledge [name="amount"]').value = pledge.amount;

        this.openModal('edit-pledge');
    },

    updatePledgeSubmit(e) {
        e.preventDefault();
        const id = document.getElementById('edit-id').value;
        const form = e.target;
        
        const amount = parseSafeFloat(form.amount.value);
        if(amount <= 0) {
            this.showToast("Amount must be greater than 0", "error");
            return;
        }

        const newData = {
            name: form.name.value,
            department: form.department.value,
            amount: amount
        };

        store.updatePledge(id, newData);
        this.closeModal('edit-pledge');
        this.showToast('Pledge updated successfully', 'success');
    },

    deletePledge(id) {
        if(confirm("Are you sure you want to delete this pledge?")) {
            store.deletePledge(id);
        }
    },

    deleteExpense(id) {
        if(confirm("Are you sure you want to delete this expense record?")) {
            store.data.expenses = store.data.expenses.filter(e => e.id !== id);
            store.save();
            this.showToast('Expense deleted', 'success');
        }
    },

    hardReset() {
        if(confirm("Are you absolutely sure? This deletes all data and custom departments.")) {
            DeptManager.reset();
            store.hardResetInternal();
        }
    },

    downloadBackup() {
        try {
            const backupData = {
                version: 1.0,
                timestamp: new Date().toISOString(),
                departments: DeptManager.getAll(),
                data: store.data
            };

            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupData, null, 2));
            const link = document.createElement("a");
            link.setAttribute("href", dataStr);
            link.setAttribute("download", `DCD_Backup_${new Date().toISOString().slice(0,10)}.json`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            
            this.showToast("Backup downloaded successfully", 'success');
        } catch (e) {
            console.error(e);
            this.showToast("Error creating backup", 'error');
        }
    },

    restoreBackup(input) {
        const file = input.files[0];
        if(!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const json = JSON.parse(e.target.result);
                
                if(!json.departments || !json.data) {
                    throw new Error("Invalid backup file format");
                }

                if(confirm("Restoring will OVERWRITE your current data and departments. This cannot be undone. Proceed?")) {
                    DeptManager.list = json.departments;
                    DeptManager.save();

                    store.data = json.data;
                    store.save();

                    this.showToast("Backup restored! Reloading...", "success");
                    setTimeout(() => location.reload(), 1000);
                }
            } catch (err) {
                console.error(err);
                this.showToast("Failed to restore backup. File may be corrupted.", "error");
            }
        };
        reader.readAsText(file);
        input.value = '';
    },

    handleCSVUpload(input) {
        const file = input.files[0];
        if(!file) return;

        try {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const text = e.target.result;
                    if(!text) throw new Error("File is empty");
                    
                    const lines = text.split('\n');
                    let count = 0;
                    let newDeptCount = 0;
                    
                    lines.forEach((line, index) => {
                        if(!line.trim()) return;

                        const parts = line.split(',');
                        
                        if(parts.length >= 3) {
                            const name = parts[0].trim();
                            const dept = parts[1].trim();
                            const amountStr = parts[2].trim();
                            const amount = parseFloat(amountStr);

                            if(isNaN(amount) || amount <= 0) return;
                            
                            if(name.toLowerCase().includes('name') && amountStr.toLowerCase().includes('amount')) return;

                            if(DeptManager.ensureExists(dept)) {
                                newDeptCount++;
                            }
                            
                            store.addPledge(name, dept, amount);
                            count++;
                        }
                    });

                    this.populateDeptSelects(); 

                    let msg = `Imported/Updated ${count} pledges.`;
                    if(newDeptCount > 0) msg += ` Created ${newDeptCount} new departments.`;
                    
                    this.showToast(msg, 'success');
                    input.value = ''; 
                } catch (err) {
                    console.error(err);
                    this.showToast("Error parsing CSV content. Check format.", 'error');
                }
            };
            reader.onerror = () => this.showToast("Error reading file.", 'error');
            reader.readAsText(file);
        } catch (err) {
            this.showToast("Error processing file upload.", 'error');
        }
    },

    exportCSV(type) {
        let csvContent = "data:text/csv;charset=utf-8,";
        let filename = "export.csv";

        if (type === 'pledges') {
            csvContent += "Name,Department,Pledged Amount\r\n";
            store.data.pledges.forEach(p => {
                csvContent += `"${p.name}","${p.department}",${p.amount}\r\n`;
            });
            filename = "DCD_Pledges.csv";
        } else if (type === 'expenses') {
            csvContent += "Date,Category,Description,Amount\r\n";
            store.data.expenses.forEach(e => {
                const dateStr = this.formatDate(e.date);
                csvContent += `"${dateStr}","${e.category}","${e.description}",${e.amount}\r\n`;
            });
            filename = "DCD_Expenses.csv";
        } else if (type === 'ledger') {
            csvContent += "Date,Type,Name/Description,Method/Category,Amount\r\n";
            // Combine transactions and expenses
            const ledger = [
                ...store.data.transactions.map(t => ({
                    date: t.date,
                    type: 'INCOME',
                    name: t.name,
                    meta: t.method,
                    amount: t.amount
                })),
                ...store.data.expenses.map(e => ({
                    date: e.date,
                    type: 'EXPENSE',
                    name: e.description,
                    meta: e.category,
                    amount: e.amount
                }))
            ].sort((a,b) => new Date(b.date) - new Date(a.date));

            ledger.forEach(row => {
                csvContent += `"${this.formatDate(row.date)}","${row.type}","${row.name}","${row.meta}",${row.amount}\r\n`;
            });
            filename = "DCD_Ledger.csv";
        }

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", filename);
        document.body.appendChild(link);
        link.click();
        link.remove();
    },

    checkDuplicate(name, dept, amount, dateObj) {
        const THIRTY_MINS = 30 * 60 * 1000;
        const checkTime = dateObj.getTime();
        return store.data.transactions.some(t => {
            const isSamePerson = t.name.toLowerCase() === name.toLowerCase() && 
                                 t.department.toLowerCase() === dept.toLowerCase();
            const isSameAmount = Math.abs(t.amount - amount) < 0.01;
            const txTime = new Date(t.date).getTime();
            const isRecent = Math.abs(txTime - checkTime) < THIRTY_MINS;
            return isSamePerson && isSameAmount && isRecent;
        });
    },

    processSMS() {
        const btn = document.getElementById('btn-parse-trigger');
        btn.innerText = "Analyzing...";
        try {
            const text = document.getElementById('sms-input').value;
            if(!text.trim()) {
                alert("Please paste text first.");
                btn.innerText = "⚡ Extract Data";
                return;
            }
            const lines = text.split('\n');
            const results = [];
            lines.forEach((line) => {
                const amtMatch = line.match(/Ksh\s*([\d,]+\.?\d*)/i);
                if(!amtMatch) return; 
                const amount = parseFloat(amtMatch[1].replace(/,/g, ''));
                const isPersonal = line.toLowerCase().includes('received');
                const isTill = line.toLowerCase().includes('sent to');
                
                if (isPersonal) {
                    const onIndex = line.indexOf(' on ');
                    if (onIndex === -1) {
                        const dateFallback = line.match(/\d{1,2}\/\d{1,2}\/\d{2,4}\s+at\s+\d{1,2}:\d{2}\s*(AM|PM)/i);
                        if(dateFallback) {
                            const dateObj = this.parseSmartMpesaDate(dateFallback[0]);
                            if(dateObj) {
                                const nameMatch = line.match(/from\s+(.*?)\s+\d{1,2}\/\d{1,2}/i);
                                let name = "Unknown";
                                if(nameMatch) name = nameMatch[1].trim();
                                results.push({ amount, name, method: 'M-Pesa', ref: 'SMS-' + Math.floor(Math.random()*10000), date: dateObj });
                            }
                        }
                    } else {
                        const parts = line.split('from');
                        if(parts.length < 2) return;
                        const rest = parts[1];
                        const onIndexRest = rest.indexOf(' on ');
                        if(onIndexRest === -1) return; 
                        let rawName = rest.substring(0, onIndexRest).trim();
                        const dateStr = rest.substring(onIndexRest + 4); 
                        rawName = rawName.replace(/\s+\d{10,}$/, '');
                        const dateObj = this.parseSmartMpesaDate(dateStr);
                        if(dateObj) {
                            results.push({ amount, name: rawName, method: 'M-Pesa', ref: 'SMS-' + Math.floor(Math.random()*10000), date: dateObj });
                        }
                    }
                } else if (isTill) {
                    const tillMatch = line.match(/sent to\s+([A-Z0-9\s]+?)\s+for account/i);
                    if(tillMatch) {
                         const onIndex = line.indexOf(' on ');
                         const dateStr = onIndex > -1 ? line.substring(onIndex + 4) : '';
                         const dateObj = dateStr ? this.parseSmartMpesaDate(dateStr) : new Date();
                         results.push({ amount, name: tillMatch[1].trim(), method: 'Till/Paybill', ref: 'TILL-' + Math.floor(Math.random()*10000), date: dateObj });
                    }
                }
            });

            if (results.length === 0) {
                alert("No valid M-Pesa messages found in text.");
                btn.innerText = "⚡ Extract Data";
                return;
            }

            this.stagedTx = results;
            this.renderStaged();
            document.getElementById('staged-area').classList.remove('hidden');
            document.getElementById('btn-parse-trigger').classList.add('hidden');
            document.getElementById('btn-commit-trigger').classList.remove('hidden');
            btn.innerText = "⚡ Extract Data";

        } catch(err) {
            console.error("Parser Crash:", err);
            alert("Critical Error: " + err.message);
            btn.innerText = "⚡ Extract Data";
        }
    },

    parseSmartMpesaDate(str) {
        if(!str) return null;
        const parts = str.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+at\s+(\d{1,2}):(\d{2})\s*(AM|PM)/i);
        if(!parts) return null;
        const day = parseInt(parts[1]);
        let month = parseInt(parts[2]) - 1; 
        let year = parseInt(parts[3]);
        if(year < 100) year += 2000;
        let hours = parseInt(parts[4]);
        const mins = parseInt(parts[5]);
        if (parts[6].toUpperCase() === 'PM' && hours !== 12) hours += 12;
        if (parts[6].toUpperCase() === 'AM' && hours === 12) hours = 0;
        return new Date(year, month, day, hours, mins);
    },

    renderStaged() {
        const list = document.getElementById('staged-list');
        document.getElementById('staged-count').innerText = this.stagedTx.length;
        list.innerHTML = '';
        this.stagedTx.forEach((tx, idx) => {
            const existing = store.data.pledges.find(p => p.name.toLowerCase() === tx.name.toLowerCase());
            let deptSelect = '';
            if (existing) {
                deptSelect = `<span class="badge badge-success">${escapeHtml(existing.department)}</span>`;
                tx.assignedDept = existing.department;
            } else {
                const depts = DeptManager.getAll();
                const options = depts.map(d => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join('');
                deptSelect = `
                    <select onchange="app.stagedTx[${idx}].assignedDept = this.value" style="padding:6px 12px; margin: 0; font-size: 0.85rem; border-radius: 6px; border: 1px solid var(--border);">
                        <option value="">Select Dept...</option>
                        ${options}
                    </select>
                `;
            }
            const itemDiv = document.createElement('div');
            itemDiv.className = 'staged-item';
            itemDiv.innerHTML = `
                <div>
                    <div style="font-weight:700; margin-bottom: 4px;">${escapeHtml(tx.name)}</div>
                    <div style="font-size:0.85rem; color:var(--text-light);">${tx.method} • ${this.formatDateTime(tx.date)}</div>
                </div>
                <div style="text-align: right;">
                    <div style="font-weight:700; color:var(--primary); margin-bottom: 8px;">${this.formatMoney(tx.amount)}</div>
                    <div>${deptSelect}</div>
                </div>
            `;
            list.appendChild(itemDiv);
        });
    },

    commitStaged() {
        let count = 0;
        this.stagedTx.forEach(tx => {
            if(!tx.assignedDept) {
                this.showToast(`Skipped ${tx.name}: No Department selected`, 'error');
                return;
            }
            
            DeptManager.ensureExists(tx.assignedDept);

            const dupe = this.checkDuplicate(tx.name, tx.assignedDept, tx.amount, tx.date);
            if (dupe) {
                this.showToast(`Duplicate Skipped: ${tx.name} (${tx.assignedDept})`, 'error');
                return;
            }
            let pledge = store.data.pledges.find(p => 
                p.name.toLowerCase() === tx.name.toLowerCase() &&
                p.department.toLowerCase() === tx.assignedDept.toLowerCase()
            );
            if(!pledge) {
                const pid = store.addPledge(tx.name, tx.assignedDept, tx.amount);
                pledge = store.data.pledges.find(p => p.id === pid);
            }
            store.addTransaction({
                pledgeId: pledge.id,
                name: pledge.name,
                department: tx.assignedDept,
                amount: tx.amount,
                type: 'credit',
                method: tx.method,
                ref: tx.ref,
                date: tx.date.toISOString() 
            });
            count++;
        });
        if(count > 0) {
            this.showToast(`Successfully committed ${count} transactions!`, 'success');
            this.closeModal('sms-parse');
            this.populateDeptSelects(); 
        } else {
            this.showToast('No transactions committed.', 'error');
        }
    },

    render() {
        try {
            this.renderDashboard();
            this.renderPledges();
            this.renderExpenses();
            this.renderLedger();
            this.renderTribes();
            this.renderSettingsList();
            this.populateDeptSelects();
        } catch(e) {
            console.error("Render Error:", e);
        }
    },

    renderDashboard() {
        const totalCash = store.data.transactions.reduce((sum, t) => sum + t.amount, 0);
        const totalExpenses = store.data.expenses.reduce((sum, e) => sum + e.amount, 0);
        const netCash = totalCash - totalExpenses;
        const totalPledges = store.data.pledges.reduce((sum, p) => sum + p.amount, 0);
        const rate = totalPledges ? Math.round((netCash / totalPledges) * 100) : 0;

        document.getElementById('dash-cash').innerText = this.formatMoney(totalCash);
        document.getElementById('dash-expenses').innerText = this.formatMoney(totalExpenses);
        document.getElementById('dash-net').innerText = this.formatMoney(netCash);
        document.getElementById('dash-pledges').innerText = this.formatMoney(totalPledges);
        document.getElementById('dash-rate').innerText = rate + '%';

        const phaseContainer = document.getElementById('phase-list');
        phaseContainer.innerHTML = '';
        store.data.phases.forEach(phase => {
            const pct = Math.min(100, Math.round((totalCash / phase.totalTarget) * 100));
            phaseContainer.innerHTML += `
                <div class="progress-wrapper">
                    <div class="progress-info">
                        <span>${escapeHtml(phase.name)} <small style="font-weight:400; color:var(--text-muted);">(${this.formatDate(phase.date)})</small></span>
                        <span style="font-weight:600;">${pct}%</span>
                    </div>
                    <div class="progress-track">
                        <div class="progress-fill ${pct < 50 ? 'warn' : ''}" style="width: ${pct}%"></div>
                    </div>
                </div>
            `;
        });

        const recent = document.getElementById('recent-activity');
        const txs = store.data.transactions.slice(0, 5);
        if(txs.length === 0) {
            recent.innerHTML = '<p class="empty-state">No recent activity.</p>';
        } else {
            recent.innerHTML = txs.map(t => `
                <div class="activity-item">
                    <div>
                        <div style="font-weight:600;">${escapeHtml(t.name)}</div>
                        <small style="color:var(--text-light);">${t.method} • ${this.formatDateTime(t.date)}</small>
                    </div>
                    <div style="font-weight: 700; color:var(--primary);">+${this.formatMoney(t.amount)}</div>
                </div>
            `).join('');
        }
    },

    renderPledges() {
        const tbody = document.getElementById('pledges-table-body');
        const search = document.getElementById('pledge-search').value.toLowerCase();
        let html = '';
        
        store.data.pledges.forEach(p => {
            if(p.name.toLowerCase().includes(search)) {
                const paid = store.data.transactions
                    .filter(t => t.pledgeId === p.id)
                    .reduce((sum, t) => sum + t.amount, 0);
                
                const balance = p.amount - paid;
                
                let statusBadge = '<span class="badge badge-info">Outstanding</span>';
                if (balance <= 0) {
                    statusBadge = '<span class="badge badge-success">Paid</span>';
                } else if (paid > 0) {
                    statusBadge = '<span class="badge badge-warn">Partial</span>';
                }

                html += `
                    <tr>
                        <td>
                            <div style="font-weight:600;">${escapeHtml(p.name)}</div>
                            <small style="color:var(--text-muted); font-size:0.75rem;">Joined: ${this.formatDate(p.date)}</small>
                        </td>
                        <td><span class="badge" style="background:#F1F5F9; color:#475569;">${escapeHtml(p.department)}</span></td>
                        <td class="text-right money">${this.formatMoney(p.amount)}</td>
                        <td class="text-right money" style="color:var(--primary);">${this.formatMoney(paid)}</td>
                        <td class="text-right money ${balance > 0 ? 'money-negative' : ''}">${this.formatMoney(balance)}</td>
                        <td class="text-right">${statusBadge}</td>
                        <td class="text-center">
                            <button class="btn btn-sm btn-secondary" onclick="app.openPaymentModal('${p.id}')" title="Record Payment">💵 Pay</button>
                            <button class="btn btn-sm btn-secondary" onclick="app.editPledge('${p.id}')" title="Edit">✏️</button>
                            <button class="btn btn-sm btn-danger" onclick="app.deletePledge('${p.id}')" title="Delete">🗑️</button>
                        </td>
                    </tr>
                `;
            }
        });
        
        tbody.innerHTML = html || '<tr><td colspan="7" class="text-center text-muted">No pledges found.</td></tr>';
    },

    renderExpenses() {
        const tbody = document.getElementById('expenses-table-body');
        let html = '';
        
        // Sort by date descending
        const sorted = [...store.data.expenses].sort((a,b) => new Date(b.date) - new Date(a.date));

        sorted.forEach(e => {
            html += `
                <tr>
                    <td>${this.formatDate(e.date)}</td>
                    <td><span class="badge badge-warn">${escapeHtml(e.category)}</span></td>
                    <td>${escapeHtml(e.description)}</td>
                    <td class="text-right money money-negative">-${this.formatMoney(e.amount)}</td>
                    <td class="text-center">
                        <button class="btn btn-sm btn-secondary" onclick="app.deleteExpense('${e.id}')">🗑️</button>
                    </td>
                </tr>
            `;
        });
        
        tbody.innerHTML = html || '<tr><td colspan="5" class="text-center text-muted">No expenses recorded.</td></tr>';
    },

    renderLedger() {
        const tbody = document.getElementById('ledger-table-body');
        
        // Combine transactions (income) and expenses
        const ledger = [
            ...store.data.transactions.map(t => ({
                id: t.id,
                date: t.date,
                ref: t.ref || t.method,
                name: t.name,
                type: 'INCOME',
                amount: t.amount
            })),
            ...store.data.expenses.map(e => ({
                id: e.id,
                date: e.date,
                ref: e.category,
                name: e.description,
                type: 'EXPENSE',
                amount: e.amount
            }))
        ].sort((a,b) => new Date(b.date) - new Date(a.date));

        let html = '';
        ledger.forEach(item => {
            const isIncome = item.type === 'INCOME';
            html += `
                <tr>
                    <td>${this.formatDateTime(item.date)}</td>
                    <td>${escapeHtml(item.ref)}</td>
                    <td>${escapeHtml(item.name)}</td>
                    <td>
                        <span class="badge ${isIncome ? 'badge-success' : 'badge-danger'}">
                            ${item.type}
                        </span>
                    </td>
                    <td class="text-right money ${isIncome ? '' : 'money-negative'}">
                        ${isIncome ? '+' : '-'}${this.formatMoney(item.amount)}
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html || '<tr><td colspan="5" class="text-center text-muted">No transactions found.</td></tr>';
    },

    renderTribes() {
        const container = document.getElementById('tribes-container');
        container.innerHTML = '';

        DeptManager.getAll().forEach(dept => {
            const pledges = store.data.pledges.filter(p => p.department === dept);
            
            const pledged = pledges.reduce((sum, p) => sum + p.amount, 0);
            
            let collected = 0;
            pledges.forEach(p => {
                collected += store.data.transactions
                    .filter(t => t.pledgeId === p.id)
                    .reduce((sum, t) => sum + t.amount, 0);
            });

            const percent = pledged > 0 ? Math.round((collected / pledged) * 100) : 0;
            const progressClass = percent < 50 ? 'danger' : (percent < 100 ? 'warn' : 'success');

            const card = document.createElement('div');
            card.className = 'card';
            card.innerHTML = `
                <div class="card-body">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
                        <h3 style="margin:0;">${escapeHtml(dept)}</h3>
                        <span class="badge badge-info">${pledges.length} Members</span>
                    </div>
                    
                    <div class="progress-wrapper">
                        <div class="progress-info">
                            <small>Collected: <strong>${this.formatMoney(collected)}</strong> / ${this.formatMoney(pledged)}</small>
                            <small>${percent}%</small>
                        </div>
                        <div class="progress-track">
                            <div class="progress-fill ${progressClass}" style="width: ${percent}%"></div>
                        </div>
                    </div>
                    
                    <div style="margin-top:16px; padding-top:16px; border-top:1px solid var(--border); display:flex; justify-content:space-between; font-size:0.85rem;">
                        <span class="text-muted">Balance</span>
                        <span class="money ${ (pledged - collected) > 0 ? 'money-negative' : '' }">
                            ${this.formatMoney(pledged - collected)}
                        </span>
                    </div>
                </div>
            `;
            container.appendChild(card);
        });
    },

    renderSettingsList() {
        const list = document.getElementById('settings-phase-list');
        list.innerHTML = '';
        
        store.data.phases.forEach(p => {
            const el = document.createElement('div');
            el.className = 'phase-item';
            el.innerHTML = `
                <div>
                    <div style="font-weight:600;">${escapeHtml(p.name)}</div>
                    <small class="text-muted">Target: ${this.formatMoney(p.totalTarget)} • Due: ${this.formatDate(p.date)}</small>
                </div>
                <button class="btn btn-sm btn-danger" onclick="store.deletePhase(${p.id})">Delete</button>
            `;
            list.appendChild(el);
        });
    },

    // --- UTILITIES ---
    formatMoney(amount) {
        return 'KES ' + amount.toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    },

    formatDate(isoString) {
        if(!isoString) return '';
        const d = new Date(isoString);
        return d.toLocaleDateString('en-GB'); // DD/MM/YYYY
    },

    formatDateTime(isoString) {
        if(!isoString) return '';
        const d = new Date(isoString);
        return d.toLocaleString('en-GB'); // DD/MM/YYYY, HH:MM
    },

    showToast(message, type = 'success') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `<span>${message}</span>`;
        
        container.appendChild(toast);
        
        // Trigger animation
        setTimeout(() => toast.classList.add('show'), 10);
        
        // Remove after 3 seconds
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
};

// Start the app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    app.init();
});
