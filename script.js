// --- CONSTANTS ---
const DEFAULT_DEPARTMENTS = ["Eagles", "Daughters of Faith", "Youth", "Kingdom Generation", "Planning Committee", "Guests"];
const DEPT_STORAGE_KEY = 'dcd_custom_departments';
const DB_KEY = 'dcd_possess_land_v22';

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
            if(app && app.render) app.render();
        } catch (e) {
            if(app && app.showToast) app.showToast("Error saving data: Storage might be full.", 'error');
        }
    },

    addPledge(n, d, a) {
        const existing = this.data.pledges.find(p => 
            p.name.toLowerCase()===n.toLowerCase() && 
            p.department.toLowerCase()===d.toLowerCase()
        );
        if(existing) { existing.amount += a; this.save(); return existing.id; }
        else {
            const id = Date.now().toString() + Math.random().toString(36).substr(2, 5);
            this.data.pledges.push({ id, name:n, department:d, amount:a, date:new Date().toISOString() }); 
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
        this.data.pledges = this.data.pledges.filter(p=>p.id!==id); 
        this.save();
    },

    addTransaction(t) { 
        this.data.transactions.unshift({
            id: Date.now().toString(),
            ...t,
            date: new Date().toISOString()
        }); 
        this.save(); 
    },

    addExpense(d,a,c) { 
        this.data.expenses.push({
            id: Date.now().toString(), 
            description:d, 
            amount:a, 
            category:c, 
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
        this.data.phases = this.data.phases.filter(p=>p.id!==id); 
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
        this.setupShortcuts();
    },

    setupShortcuts() {
        // Keyboard Shortcuts for Power Users
        document.addEventListener('keydown', (e) => {
            // Ignore if user is typing in an input
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            const key = e.key.toUpperCase();
            
            if (key === 'C') {
                e.preventDefault();
                this.openModal('manual-cash');
            } else if (key === 'N') {
                e.preventDefault();
                this.openModal('pledge');
            } else if (key === 'E') {
                e.preventDefault();
                this.openModal('expense');
            }
        });
    },

    router(id) {
        document.querySelectorAll('main > section').forEach(e => e.classList.add('hidden'));
        document.getElementById(`view-${id}`).classList.remove('hidden');
        
        document.querySelectorAll('.nav-item').forEach(e => e.classList.remove('active'));
        const map = {'dashboard':0, 'pledges':1, 'ledger':2, 'expenses':3, 'tribes':4, 'settings':5 };
        const nav = document.querySelectorAll('.nav-item');
        if(nav[map[id]]) nav[map[id]].classList.add('active');
    },
    
    openModal(t) { 
        const el = document.getElementById(`modal-${t}`);
        if(el) el.classList.add('open');
    },
    
    closeModal(t) { 
        const el = document.getElementById(`modal-${t}`);
        if(el) el.classList.remove('open');
        if(t === 'sms-parse') {
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
        const opts = depts.map(d=>`<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join('');
        ['modal-dept-select','edit-dept-select','cash-dept'].forEach(id => { const el = document.getElementById(id); if(el) el.innerHTML = opts; });
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
                div.innerHTML = `
                    <label style="font-size:0.8rem;">${escapeHtml(dept)}</label>
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
        document.getElementById('phase-name').value = '';
        this.updateTotalPreview();
        this.renderSettingsList();
    },

    submitPledge(e) {
        e.preventDefault();
        const form = e.target;
        const amount = parseSafeFloat(form.amount.value);
        if(amount <= 0) { this.showToast("Amount must be greater than 0", "error"); return; }
        store.addPledge(form.name.value, form.department.value, amount);
        this.closeModal('pledge'); 
        form.reset();
    },

    submitExpense(e) {
        e.preventDefault();
        const desc = document.getElementById('expense-desc').value;
        const amount = parseSafeFloat(document.getElementById('expense-amount').value);
        const category = document.getElementById('expense-category').value;
        if(amount <= 0) { this.showToast("Amount must be greater than 0", "error"); return; }
        store.addExpense(desc, amount, category);
        this.closeModal('expense'); 
        e.target.reset();
        this.showToast('Expense recorded', 'error'); // Visual alert using error style
    },

    submitManualCash(e) {
        e.preventDefault();
        const name = document.getElementById('cash-name').value;
        const dept = document.getElementById('cash-dept').value;
        const amount = parseSafeFloat(document.getElementById('cash-amount').value);
        const ref = document.getElementById('cash-ref').value || 'Manual Cash';
        const timestamp = new Date(); 

        if(amount <= 0) { this.showToast("Amount must be greater than 0", "error"); return; }

        const isDupe = store.data.transactions.some(t => 
            t.name.toLowerCase()===name.toLowerCase() && 
            t.department.toLowerCase()===dept.toLowerCase() && 
            (new Date() - new Date(t.date)) < 120000
        );
        if(isDupe) return alert('Duplicate payment detected.');

        let pledge = store.data.pledges.find(p => 
            p.name.toLowerCase()===name.toLowerCase() && 
            p.department.toLowerCase()===dept.toLowerCase()
        );
        
        if(!pledge) {
            const pid = store.addPledge(name, dept, amount);
            pledge = store.data.pledges.find(p => p.id === pid);
        }
        
        store.addTransaction({
            pledgeId: pledge.id, name: pledge.name, department: dept, amount: amount, 
            type: 'credit', method: 'Cash', ref: ref, date: timestamp.toISOString() 
        });

        this.closeModal('manual-cash'); 
        this.showToast('Payment recorded!', 'success');
        e.target.reset();
    },

    editPledge(id) {
        const p = store.data.pledges.find(x => x.id === id);
        document.getElementById('edit-id').value = p.id;
        document.querySelector('#modal-edit-pledge [name="name"]').value = p.name;
        document.querySelector('#modal-edit-pledge [name="department"]').value = p.department;
        document.querySelector('#modal-edit-pledge [name="amount"]').value = p.amount;
        this.openModal('edit-pledge');
    },

    updatePledgeSubmit(e) {
        e.preventDefault();
        const id = document.getElementById('edit-id').value;
        const form = e.target;
        const amount = parseSafeFloat(form.amount.value);
        if(amount <= 0) { this.showToast("Amount must be greater than 0", "error"); return; }
        const newData = { name: form.name.value, department: form.department.value, amount: amount };
        store.updatePledge(id, newData);
        this.closeModal('edit-pledge');
        this.showToast('Pledge updated successfully', 'success');
    },

    deletePledge(id) { 
        if(confirm('Delete this pledge?')) { store.deletePledge(id); } 
    },
    
    deleteExpense(id) { 
        if(confirm('Delete this expense?')) { 
            store.data.expenses = store.data.expenses.filter(e=>e.id!==id); 
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
                if(!json.departments || !json.data) throw new Error("Invalid backup file format");
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
                            if(DeptManager.ensureExists(dept)) newDeptCount++;
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
            const ledger = [
                ...store.data.transactions.map(t=>({...t, type:'INCOME', name:t.name, meta:t.method})),
                ...store.data.expenses.map(e=>({...e, type:'EXPENSE', name:e.description, meta:e.category}))
            ].sort((a,b)=>new Date(b.date)-new Date(a.date));
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

    // --- NEW SNAPSHOT FEATURE ---
    generateSnapshot() {
        const today = new Date().toISOString().split('T')[0];
        
        // Filter today's transactions
        const todayTxs = store.data.transactions.filter(t => t.date.startsWith(today));
        const todayExp = store.data.expenses.filter(e => e.date.startsWith(today));
        
        const totalCash = todayTxs.reduce((sum,t)=>sum+t.amount,0);
        const totalExp = todayExp.reduce((sum,e)=>sum+e.amount,0);
        
        document.getElementById('snapshot-date').innerText = new Date().toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        document.getElementById('snap-cash').innerText = this.formatMoney(totalCash);
        document.getElementById('snap-expenses').innerText = this.formatMoney(totalExp);
        
        const detailsDiv = document.getElementById('snapshot-details');
        if(todayTxs.length === 0 && todayExp.length === 0) {
            detailsDiv.innerHTML = '<p class="text-muted" style="text-align:center;">No activity recorded today yet.</p>';
        } else {
            let html = '<table style="width:100%; margin-top:10px;"><thead><tr><th>Who</th><th>Type</th><th class="text-right">Amount</th></tr></thead><tbody>';
            
            todayTxs.forEach(t => {
                html += `<tr><td>${escapeHtml(t.name)}</td><td>${t.method}</td><td class="text-right text-success">+${this.formatMoney(t.amount)}</td></tr>`;
            });
            
            todayExp.forEach(e => {
                html += `<tr><td>${escapeHtml(e.description)}</td><td>${e.category}</td><td class="text-right text-danger">-${this.formatMoney(e.amount)}</td></tr>`;
            });
            
            html += '</tbody></table>';
            detailsDiv.innerHTML = html;
        }
        
        this.openModal('snapshot');
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
                    <div style="font-weight:700; margin-bottom:4px;">${escapeHtml(tx.name)}</div>
                    <div style="font-size:0.85rem; color:var(--text-muted);">${tx.method} • ${this.formatDateTime(tx.date)}</div>
                </div>
                <div style="text-align: right;">
                    <div style="font-weight:700; color:var(--primary); margin-bottom:8px;">${this.formatMoney(tx.amount)}</div>
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
            const dupe = store.data.transactions.some(t => {
                const isSamePerson = t.name.toLowerCase() === tx.name.toLowerCase() && t.department.toLowerCase() === tx.assignedDept.toLowerCase();
                const isSameAmount = Math.abs(t.amount - tx.amount) < 0.01;
                const txTime = new Date(t.date).getTime();
                const checkTime = tx.date.getTime();
                const isRecent = Math.abs(txTime - checkTime) < 60000;
                return isSamePerson && isSameAmount && isRecent;
            });
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
            this.populateDeptSelects();
        } catch(e) {
            console.error("Render Error:", e);
        }
    },

    renderDashboard() {
        const cash = store.data.transactions.reduce((s,t)=>s+t.amount,0);
        const exp = store.data.expenses.reduce((s,e)=>s+e.amount,0);
        const net = cash - exp;
        const pledged = store.data.pledges.reduce((s,p)=>s+p.amount,0);
        const eff = pledged ? Math.round((net/pledged)*100) : 0;

        document.getElementById('dash-cash').innerText = this.formatMoney(cash);
        document.getElementById('dash-expenses').innerText = this.formatMoney(exp);
        document.getElementById('dash-net').innerText = this.formatMoney(net);
        document.getElementById('dash-pledges').innerText = this.formatMoney(pledged);
        document.getElementById('dash-rate').innerText = eff + '%';

        // MILESTONE PULSE: If efficiency > 50%, pulse the card
        const effCard = document.getElementById('card-efficiency');
        if(eff >= 50) {
            effCard.classList.add('kpi-milestone');
        } else {
            effCard.classList.remove('kpi-milestone');
        }

        // PROJECTION BAR (POSSIBILITY)
        const projBar = document.getElementById('proj-bar');
        if(projBar) {
            const potential = pledged || 1;
            const pct = Math.min(100, Math.round((net / potential) * 100));
            projBar.style.width = `${pct}%`;
        }

        // Phases
        const phaseContainer = document.getElementById('phase-list');
        phaseContainer.innerHTML = '';
        store.data.phases.forEach(p => {
            const pct = Math.min(100, Math.round((cash/p.totalTarget)*100));
            phaseContainer.innerHTML += `
                <div style="margin-bottom: 20px;">
                    <div class="progress-info" style="display:flex; justify-content:space-between; margin-bottom:8px;">
                        <span>${escapeHtml(p.name)} <small style="font-weight:400; color:var(--text-muted);">(${this.formatDate(p.date)})</small></span>
                        <span style="font-size:0.9rem;">${pct}%</span>
                    </div>
                    <div style="width:100%; height:8px; background:#E5E7EB; border-radius:4px; overflow:hidden;">
                        <div class="progress-fill" style="width:${pct}%; height:100%; background:var(--primary); border-radius:4px; transition: width 1s;"></div>
                    </div>
                </div>
            `;
        });

        // Recent
        const recent = document.getElementById('recent-activity');
        const txs = store.data.transactions.slice(0,5);
        if(txs.length === 0) {
            recent.innerHTML = '<p class="empty-state" style="text-align: center; padding: 20px; color: var(--text-muted);">No recent activity.</p>';
        } else {
            recent.innerHTML = txs.map(t => `
                <div class="activity-item" style="padding:12px; border-bottom:1px solid #F3F4F6; display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <div style="font-weight:600;">${escapeHtml(t.name)}</div>
                        <small style="color:var(--text-muted);">${t.method} • ${this.formatDateTime(t.date)}</small>
                    </div>
                    <div style="font-weight:700; color:var(--primary);">+${this.formatMoney(t.amount)}</div>
                </div>
            `).join('');
        }
        
        // Charts
        MiniCharts.renderDonut('chart-efficiency', eff, '#059669');
        const deptData = DeptManager.getAll().map(dept => {
            const pledged = store.data.pledges.filter(p=>p.department===dept).reduce((s,p)=>s+p.amount,0);
            const collected = store.data.pledges.filter(p=>p.department===dept)
                .reduce((sum, p) => sum + store.data.transactions.filter(t=>t.pledgeId===p.id).reduce((s,t)=>s+t.amount,0), 0);
            return { label: dept, value: collected, target: pledged };
        });
        MiniCharts.renderBars('chart-departments', deptData);
    },

    renderPledges() {
        const tbody = document.getElementById('pledges-table-body');
        const search = document.getElementById('pledge-search').value.toLowerCase();
        let html = '';
        store.data.pledges.filter(p => p.name.toLowerCase().includes(search)).map(p => {
            const paid = store.data.transactions.filter(t=>t.pledgeId===p.id).reduce((s,t)=>s+t.amount,0);
            const bal = p.amount - paid;
            const status = bal <= 0 ? 'Paid' : (paid > 0 ? 'Partial' : 'Outstanding');
            const color = bal <= 0 ? 'badge-success' : (paid > 0 ? 'badge-warn' : 'badge-info');
            return `
                <tr>
                    <td><div style="font-weight:600;">${escapeHtml(p.name)}</div></td>
                    <td><span class="badge" style="background:#F3F4F6; color:#6B7280;">${escapeHtml(p.department)}</span></td>
                    <td class="text-right money">${this.formatMoney(p.amount)}</td>
                    <td class="text-right money" style="color:var(--primary);">${this.formatMoney(paid)}</td>
                    <td class="text-right money ${bal>0?'money-negative':''}">${this.formatMoney(bal)}</td>
                    <td class="text-right"><span class="badge ${color}">${status}</span></td>
                    <td class="text-center">
                        <button class="btn btn-sm btn-secondary" onclick="app.editPledge('${p.id}')">Edit</button>
                        <button class="btn btn-sm btn-danger" onclick="app.deletePledge('${p.id}')">Del</button>
                    </td>
                </tr>
            `;
        }).join('') || '<tr><td colspan="7" class="text-center text-muted">No pledges found.</td></tr>';
        tbody.innerHTML = html;
    },
    
    renderExpenses() {
        const tbody = document.getElementById('expenses-table-body');
        tbody.innerHTML = [...store.data.expenses].sort((a,b)=>new Date(b.date)-new Date(a.date)).map(e => `
            <tr>
                <td>${this.formatDate(e.date)}</td>
                <td><span class="badge badge-warn">${escapeHtml(e.category)}</span></td>
                <td>${escapeHtml(e.description)}</td>
                <td class="text-right money money-negative">-${this.formatMoney(e.amount)}</td>
                <td class="text-center"><button class="btn btn-sm btn-secondary" onclick="app.deleteExpense('${e.id}')">x</button></td>
            </tr>
        `).join('') || '<tr><td colspan="5" class="text-center text-muted">No expenses.</td></tr>';
    },
    
    renderLedger() {
        const tbody = document.getElementById('ledger-table-body');
        const ledger = [
            ...store.data.transactions.map(t=>({...t, type:'INCOME', name:t.name, meta:t.method})),
            ...store.data.expenses.map(e=>({...e, type:'EXPENSE', name:e.description, meta:e.category}))
        ].sort((a,b)=>new Date(b.date)-new Date(a.date));
        let html = '';
        ledger.forEach(item => {
            const isIncome = item.type==='INCOME';
            html += `
                <tr>
                    <td>${this.formatDate(item.date)}</td>
                    <td>${item.meta}</td>
                    <td>${escapeHtml(item.name)}</td>
                    <td><span class="badge ${isIncome?'badge-success':'badge-danger'}">${item.type}</span></td>
                    <td class="text-right money ${!isIncome?'money-negative':''}">${isIncome?'+':'-'}${this.formatMoney(item.amount)}</td>
                </tr>
            `;
        });
        tbody.innerHTML = html || '<tr><td colspan="5" class="text-center text-muted">No transactions.</td></tr>';
    },
    
    renderTribes() {
        const container = document.getElementById('tribes-container');
        container.innerHTML = '';
        DeptManager.getAll().map(dept => {
            const pledged = store.data.pledges.filter(p=>p.department===dept).reduce((s,p)=>s+p.amount,0);
            const collected = store.data.pledges.filter(p=>p.department===dept).reduce((sum, p) => sum + store.data.transactions.filter(t=>t.pledgeId===p.id).reduce((s,t)=>s+t.amount,0), 0);
            const pct = pledged ? Math.round((collected/pledged)*100) : 0;
            return `
                <div class="card">
                    <div style="padding:24px;">
                        <div style="display:flex; justify-content:space-between; margin-bottom:16px;">
                            <h3>${escapeHtml(dept)}</h3>
                            <span class="badge badge-info">${store.data.pledges.filter(p=>p.department===dept).length} Members</span>
                        </div>
                        <div style="width:100%; height:10px; background:#F3F4F6; border-radius:5px; overflow:hidden;">
                            <div class="progress-fill" style="width:${pct}%; height:100%; background:var(--primary); border-radius:5px;"></div>
                        </div>
                        <div style="display:flex; justify-content:space-between; margin-top:8px; font-size:0.9rem;">
                            <span class="text-muted">Collected</span>
                            <span style="font-weight:700;">${this.formatMoney(collected)} / ${this.formatMoney(pledged)}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
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
        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
};

// --- CHARTING ENGINE ---
const MiniCharts = {
    renderDonut(containerId, percentage, color) {
        const container = document.getElementById(containerId);
        if(!container) return;
        const svgNS = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(svgNS, "svg");
        svg.setAttribute("viewBox", "0 0 36 36");
        svg.setAttribute("class", "chart");

        const bgCircle = document.createElementNS(svgNS, "path");
        bgCircle.setAttribute("d", "M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831");
        bgCircle.setAttribute("fill", "none");
        bgCircle.setAttribute("stroke", "#E5E7EB");
        bgCircle.setAttribute("stroke-width", "3");
        svg.appendChild(bgCircle);

        const strokeDasharray = `${percentage}, 100`;
        const fgCircle = document.createElementNS(svgNS, "path");
        fgCircle.setAttribute("d", "M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831");
        fgCircle.setAttribute("fill", "none");
        fgCircle.setAttribute("stroke", color);
        fgCircle.setAttribute("stroke-width", "3");
        fgCircle.setAttribute("stroke-dasharray", strokeDasharray);
        fgCircle.setAttribute("stroke-linecap", "round");
        fgCircle.setAttribute("class", "donut-segment");
        svg.appendChild(fgCircle);

        container.innerHTML = '';
        container.appendChild(svg);
    },
    
    renderBars(containerId, data) {
        const container = document.getElementById(containerId);
        if(!container) return;
        const maxVal = Math.max(...data.map(d=>d.target)) || 1;
        const width = container.clientWidth || 400;
        const height = 250;
        const barWidth = (width / data.length) * 0.6;
        const gap = (width / data.length) * 0.4;

        const svgNS = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(svgNS, "svg");
        svg.setAttribute("width", "100%");
        svg.setAttribute("height", "100%");
        svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
        svg.setAttribute("preserveAspectRatio", "none");

        data.forEach((d, i) => {
            const h = (d.value / maxVal) * (height - 40); 
            const x = i * (barWidth + gap) + (gap / 2);
            const y = height - h - 20;

            const rect = document.createElementNS(svgNS, "rect");
            rect.setAttribute("x", x);
            rect.setAttribute("y", y);
            rect.setAttribute("width", barWidth);
            rect.setAttribute("height", h);
            rect.setAttribute("fill", "#059669");
            rect.setAttribute("rx", 6);
            rect.setAttribute("class", "bar");
            
            const title = document.createElementNS(svgNS, "title");
            title.textContent = `${d.label}: ${this.formatMoney(d.value)} / ${this.formatMoney(d.target)}`;
            rect.appendChild(title);

            const text = document.createElementNS(svgNS, "text");
            text.setAttribute("x", x + (barWidth/2));
            text.setAttribute("y", height - 5);
            text.setAttribute("text-anchor", "middle");
            text.setAttribute("fill", "#6B7280");
            text.setAttribute("font-size", "10");
            text.textContent = d.label.substring(0, 4) + '..';

            svg.appendChild(rect);
            svg.appendChild(text);
        });

        container.innerHTML = '';
        container.appendChild(svg);
    }
};

document.addEventListener('DOMContentLoaded', () => app.init());
