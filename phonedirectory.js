/**
 * Raffles Seychelles — Telephone Directory
 * v3.0 — Company Server Edition (no Firebase, no cloud)
 *
 * All data is read from and written to data.json on the company server.
 * Changes made by admin are saved instantly to disk and visible to all
 * staff on their next interaction (or page reload).
 */

/* ═══════════════════════════════════════════
   STATE
═══════════════════════════════════════════ */
var adminMode  = false;
var adminPassword = '';   /* loaded from server */

var contacts       = [];
var departments    = [];
var subdepartments = [];
var table          = null;

/* Column definition — single source of truth */
var COL_FIELDS = [
  { label: 'Name',          key: 'name' },
  { label: 'Designation',   key: 'designation' },
  { label: 'Department',    key: 'department' },
  { label: 'Subdepartment', key: 'subdepartment' },
  { label: 'Extension',     key: 'extension' },
  { label: 'Email',         key: 'email' },
  { label: 'Mobile',        key: 'mobile' }
];

/* ═══════════════════════════════════════════
   SERVER API
═══════════════════════════════════════════ */
function loadFromServer() {
  setSyncStatus('syncing', 'Loading…');
  fetch('/api/data')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      contacts       = (data.contacts       || []);
      departments    = (data.departments    || []);
      subdepartments = (data.subdepartments || []);
      if (data.password) adminPassword = data.password;
      fillDepartmentOptions();
      fillSubdepartmentOptions();
      rebuildTable();
      setSyncStatus('connected', 'Server Sync');
    })
    .catch(function() {
      setSyncStatus('error', 'Server Error');
    });
}

function saveToServer(cb) {
  setSyncStatus('syncing', 'Saving…');
  fetch('/api/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contacts:       contacts,
      departments:    departments,
      subdepartments: subdepartments,
      password:       adminPassword
    })
  })
    .then(function(r) { return r.json(); })
    .then(function(res) {
      if (res.ok) {
        setSyncStatus('connected', 'Server Sync');
        if (cb) cb();
      } else {
        setSyncStatus('error', 'Save Error');
        showNotice('error', 'Save failed: ' + (res.error || 'unknown error'));
      }
    })
    .catch(function(e) {
      setSyncStatus('error', 'Server Error');
      showNotice('error', 'Could not reach server: ' + e.message);
    });
}

/* ═══════════════════════════════════════════
   CONTACT CRUD
═══════════════════════════════════════════ */
function addContact(contact, cb) {
  contact._id = 'S' + Date.now() + Math.random().toString(36).slice(2, 6);
  contacts.push(contact);
  rebuildTable();
  saveToServer(cb);
}

function updateContact(id, contact, cb) {
  var idx = contacts.findIndex(function(c) { return c._id === id; });
  if (idx > -1) contacts[idx] = Object.assign({ _id: id }, contact);
  rebuildTable();
  saveToServer(cb);
}

function deleteContact(id, cb) {
  contacts = contacts.filter(function(c) { return c._id !== id; });
  rebuildTable();
  saveToServer(cb);
}

function deleteManyContacts(ids, cb) {
  contacts = contacts.filter(function(c) { return ids.indexOf(c._id) === -1; });
  rebuildTable();
  saveToServer(cb);
}

function saveDepts(cb) {
  saveToServer(cb);
}

/* ═══════════════════════════════════════════
   SYNC STATUS
═══════════════════════════════════════════ */
function setSyncStatus(state, label) {
  var el = document.getElementById('syncStatus');
  if (!el) return;
  el.className = 'sync-status ' + state;
  el.querySelector('.sync-label').textContent = label;
}

/* ═══════════════════════════════════════════
   DEPT / SUBDEPT UI
═══════════════════════════════════════════ */
function fillDepartmentOptions(sel) {
  var opts = '<option value="">Select Department</option>';
  departments.forEach(function(d) { opts += '<option value="' + esc(d) + '">' + esc(d) + '</option>'; });
  $('#department').html(opts);
  if (sel) $('#department').val(sel);

  var fOpts = '<option value="">All Departments</option>';
  departments.forEach(function(d) { fOpts += '<option value="' + esc(d) + '">' + esc(d) + '</option>'; });
  $('#departmentFilter').html(fOpts);

  var sOpts = '';
  departments.forEach(function(d) { sOpts += '<option value="' + esc(d) + '">' + esc(d) + '</option>'; });
  $('#newSubdepartmentDepartment').html(sOpts);
}

function fillSubdepartmentOptions(selDept, selSub) {
  var subs = subdepartments
    .filter(function(s) { return !selDept || s.department === selDept; })
    .map(function(s) { return s.name; });

  var opts = '<option value="">Select Subdepartment</option>';
  subs.forEach(function(s) { opts += '<option value="' + esc(s) + '">' + esc(s) + '</option>'; });
  $('#subdepartment').html(opts);
  if (selSub) $('#subdepartment').val(selSub);
  if (subs.length > 0) { $('#subdepartment-container').show(); }
  else { $('#subdepartment-container').hide(); $('#subdepartment').val(''); }
}

function renderDepartmentsList() {
  var html = '';
  departments.forEach(function(d, i) {
    html += '<li><span>' + esc(d) + '</span><button class="del-btn-sm del-dep" data-i="' + i + '"><i class="fas fa-trash"></i></button></li>';
  });
  $('#departmentsList').html(html);
}

function renderSubdepartmentsList() {
  var html = '';
  subdepartments.forEach(function(s, i) {
    html += '<li><span>' + esc(s.name) + '</span><span class="label">' + esc(s.department) + '</span>' +
      '<button class="del-btn-sm del-subdep" data-i="' + i + '"><i class="fas fa-trash"></i></button></li>';
  });
  $('#subdepartmentsList').html(html);
}

/* ═══════════════════════════════════════════
   TABLE
═══════════════════════════════════════════ */
function deptColIdx() { return adminMode ? 3 : 2; }

function buildTableConfig() {
  var cols = [], headCells = [];

  if (adminMode) {
    cols.push({ data: null, orderable: false, className: 'select-col',
      defaultContent: '<input type="checkbox" class="contact-select">' });
    headCells.push('<th class="select-col"><input type="checkbox" id="selectAllContacts"></th>');
  }

  COL_FIELDS.forEach(function(f) {
    headCells.push('<th>' + f.label + '</th>');
    cols.push({ data: f.key, defaultContent: '', render: naRender });
  });

  headCells.push('<th class="actions-col">' + (adminMode ? 'Actions' : '') + '</th>');
  cols.push({
    data: null, className: 'actions-col', orderable: false, visible: adminMode,
    defaultContent:
      '<button class="act-btn act-edit" title="Edit"><i class="fas fa-pen"></i></button>' +
      '<button class="act-btn act-delete" title="Delete"><i class="fas fa-trash"></i></button>'
  });

  return { cols: cols, headHtml: '<tr>' + headCells.join('') + '</tr>' };
}

function naRender(data) {
  if (data === null || data === undefined || data === '') return '';
  if (data === 'N/A' || data === 'Unknown') return '<span class="na-badge">' + esc(String(data)) + '</span>';
  return esc(String(data));
}

function rebuildTable() {
  var cfg = buildTableConfig();
  $('#contactTableHead').html(cfg.headHtml);

  if ($.fn.DataTable.isDataTable('#contactTable')) {
    $('#contactTable').DataTable().destroy();
    $('#contactTable').find('tbody').empty();
  }

  table = $('#contactTable').DataTable({
    data: contacts,
    columns: cfg.cols,
    responsive: false,
    autoWidth: false,
    order: [[ adminMode ? 1 : 0, 'asc' ]],
    pageLength: 25,
    lengthMenu: [ [10, 25, 50, 100, -1], [10, 25, 50, 100, 'All'] ],
    dom: 'lrtip',
    language: {
      lengthMenu:  'Show _MENU_ entries',
      emptyTable:  'No contacts found.',
      zeroRecords: 'No contacts match your search.',
      info:        'Showing _START_–_END_ of _TOTAL_ contacts',
      infoEmpty:   'No contacts',
      paginate: { previous: '‹', next: '›' }
    }
  });

  /* Move DataTables controls into the sticky bottom bar */
  var wrapper = $('#contactTable').closest('.dataTables_wrapper');
  $('#dtLength').empty().append(wrapper.find('.dataTables_length'));
  $('#dtInfo').empty().append(wrapper.find('.dataTables_info'));
  $('#dtPaginate').empty().append(wrapper.find('.dataTables_paginate'));

  var searchVal = $('#globalSearch').val() || '';
  if (searchVal) table.search(searchVal).draw();

  var dept = $('#departmentFilter').val();
  if (dept) {
    table.column(deptColIdx()).search('^' + $.fn.dataTable.util.escapeRegex(dept) + '$', true, false).draw();
  }
}

/* ═══════════════════════════════════════════
   ADMIN UI
═══════════════════════════════════════════ */
function updateAdminUI() {
  var btns = '#addContactBtn,#changePasswordBtn,#exportBtn,#importJsonBtn,#importExcelBtn,#manageDepartmentsBtn,#manageSubdepartmentsBtn,#deleteSelectedBtn';
  if (adminMode) {
    $(btns).removeClass('hidden');
    $('#loginBtn').html('<i class="fas fa-sign-out-alt"></i> Logout').addClass('btn-danger-outline').removeClass('btn-outline');
  } else {
    $(btns).addClass('hidden');
    $('#loginBtn').html('<i class="fas fa-lock"></i> Admin Login').addClass('btn-outline').removeClass('btn-danger-outline');
  }
  rebuildTable();
}

/* ═══════════════════════════════════════════
   FORM HELPERS
═══════════════════════════════════════════ */
function getFormData() {
  var operator  = $('#operatorSelect').val();
  var mobileRaw = $('[name="mobile"]').val().trim();
  var mobile    = (operator && mobileRaw) ? (operator + ' ' + mobileRaw) : mobileRaw;
  return {
    name:          $('[name="name"]').val().trim(),
    designation:   $('[name="designation"]').val().trim(),
    department:    $('#department').val() || '',
    subdepartment: $('#subdepartment').val() || '',
    extension:     $('[name="extension"]').val().trim(),
    email:         $('[name="email"]').val().trim(),
    mobile:        mobile
  };
}

function validateForm() {
  var valid = true;
  $('.error-message').addClass('hidden');
  if (!$('[name="name"]').val().trim()) {
    $('[name="name"]').next('.error-message').text('Required').removeClass('hidden');
    valid = false;
  }
  var email = $('[name="email"]').val().trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    $('[name="email"]').next('.error-message').text('Please enter a valid email').removeClass('hidden');
    valid = false;
  }
  var op  = $('#operatorSelect').val();
  var mob = $('[name="mobile"]').val().trim();
  if (op && !mob) {
    $('[name="mobile"]').closest('.flex-grow').find('.error-message').text('Enter mobile number').removeClass('hidden');
    valid = false;
  }
  return valid;
}

function populateForm(data) {
  $('#addContactForm')[0].reset();
  $('.error-message').addClass('hidden');
  $('#formError').addClass('hidden');
  $('[name="name"]').val(data.name || '');
  $('[name="designation"]').val(data.designation || '');
  fillDepartmentOptions(data.department || '');
  fillSubdepartmentOptions(data.department || '', data.subdepartment || '');
  $('[name="extension"]').val(data.extension || '');
  $('[name="email"]').val(data.email || '');

  var operator = '', mobileNum = data.mobile || '';
  if (data.mobile) {
    var spIdx = data.mobile.indexOf(' ');
    if (spIdx > 0) {
      var prefix = data.mobile.substring(0, spIdx);
      if (/^\+\d{1,4}$/.test(prefix) || /^\d{3}$/.test(prefix)) {
        operator  = prefix;
        mobileNum = data.mobile.substring(spIdx + 1);
      }
    }
  }
  $('#operatorSelect').val(operator);
  $('[name="mobile"]').val(mobileNum);
}

/* ═══════════════════════════════════════════
   EXCEL IMPORT
═══════════════════════════════════════════ */
var excelRows = [];

function handleExcelFile(file) {
  var reader = new FileReader();
  reader.onload = function(e) {
    try {
      var data = new Uint8Array(e.target.result);
      var wb   = XLSX.read(data, { type: 'array' });
      var ws   = wb.Sheets[wb.SheetNames[0]];
      excelRows = XLSX.utils.sheet_to_json(ws, { defval: '' });
      if (!excelRows.length) { showNotice('error', 'File appears to be empty.'); return; }
      showColumnMappingModal(Object.keys(excelRows[0]));
    } catch(ex) { showNotice('error', 'Could not read file: ' + ex.message); }
  };
  reader.readAsArrayBuffer(file);
}

function showColumnMappingModal(excelCols) {
  var synonyms = {
    name:          ['name','contact','full name','fullname','staff','employee','personnel','person'],
    designation:   ['designation','title','position','job','role','post','rank'],
    department:    ['department','dept','division','group','team'],
    subdepartment: ['subdepartment','sub department','sub-department','sub dept','subsection','outlet'],
    extension:     ['extension','ext','internal','int no','direct','tel','telephone','phone','pbx'],
    email:         ['email','e-mail','mail','address','e mail'],
    mobile:        ['mobile','cell','cellphone','gsm','handphone','whatsapp','number','contact no','phone no']
  };

  function autoMatch(key) {
    var tries = synonyms[key] || [key];
    for (var i = 0; i < excelCols.length; i++) {
      var low = excelCols[i].toLowerCase().trim();
      for (var j = 0; j < tries.length; j++) {
        if (low.indexOf(tries[j]) !== -1) return excelCols[i];
      }
    }
    return '';
  }

  var colOpts = '<option value="">(Skip)</option>' +
    excelCols.map(function(c) { return '<option value="' + esc(c) + '">' + esc(c) + '</option>'; }).join('');

  var grid = '<div class="mapping-grid">';
  COL_FIELDS.forEach(function(f) {
    var matched = autoMatch(f.key);
    var opts = colOpts.replace('value="' + esc(matched) + '"', 'value="' + esc(matched) + '" selected');
    grid += '<div class="mapping-field-label">' + f.label + '</div>' +
      '<div class="mapping-arrow"><i class="fas fa-arrow-right"></i></div>' +
      '<div><select class="raffles-input map-select" data-field="' + f.key + '">' + opts + '</select></div>';
  });
  grid += '</div>';

  var preview = excelRows.slice(0, 5);
  var ph = '<h6 style="margin-top:20px;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:var(--text-mid);">Preview — first 5 rows</h6>' +
    '<div style="overflow-x:auto"><table class="preview-table"><thead><tr>' +
    excelCols.map(function(c) { return '<th>' + esc(c) + '</th>'; }).join('') +
    '</tr></thead><tbody>';
  preview.forEach(function(row) {
    ph += '<tr>' + excelCols.map(function(c) { return '<td>' + esc(String(row[c] || '')) + '</td>'; }).join('') + '</tr>';
  });
  ph += '</tbody></table></div>';

  $('#columnMappingArea').html(grid);
  $('#previewTableArea').html(ph);
  $('#excelPreviewModal').modal('show');
}

function doExcelImport() {
  var mapping = {};
  $('.map-select').each(function() {
    var f = $(this).data('field'), col = $(this).val();
    if (col) mapping[f] = col;
  });
  if (!mapping.name) { showNotice('error', 'Please map the "Name" column first.'); return; }

  var toAdd = [];
  excelRows.forEach(function(row) {
    var c = {
      name:          String(row[mapping.name]          || '').trim() || 'Unknown',
      designation:   String(row[mapping.designation]   || '').trim(),
      department:    String(row[mapping.department]     || '').trim(),
      subdepartment: String(row[mapping.subdepartment]  || '').trim(),
      extension:     String(row[mapping.extension]      || '').trim(),
      email:         String(row[mapping.email]          || '').trim(),
      mobile:        String(row[mapping.mobile]         || '').trim()
    };
    if (!c.name || c.name === 'Unknown') {
      if (!(c.designation || c.department || c.extension || c.email || c.mobile)) return;
    }
    var dup = contacts.some(function(ex) {
      return ex.name === c.name && ex.department === c.department && ex.extension === c.extension;
    });
    if (!dup) toAdd.push(c);
  });

  if (!toAdd.length) { showNotice('info', 'No new contacts — all rows already exist.'); return; }

  $('#excelPreviewModal').modal('hide');
  setSyncStatus('syncing', 'Importing ' + toAdd.length + ' contacts…');

  toAdd.forEach(function(c) {
    c._id = 'S' + Date.now() + Math.random().toString(36).slice(2, 6);
    contacts.push(c);
  });
  rebuildTable();
  saveToServer(function() {
    showNotice('success', 'Imported ' + toAdd.length + ' contact' + (toAdd.length > 1 ? 's' : '') + '!');
  });
}

/* ═══════════════════════════════════════════
   JSON EXPORT / IMPORT
═══════════════════════════════════════════ */
function exportToJSON() {
  var data = contacts.map(function(c) { var o = Object.assign({}, c); delete o._id; return o; });
  var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = 'raffles_directory_' + new Date().toISOString().slice(0,10) + '.json';
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  showNotice('success', 'Contacts exported!');
}

function importFromJSON(parsed) {
  if (!Array.isArray(parsed)) { showNotice('error', 'Expected a JSON array.'); return; }
  var mapped = parsed.map(function(r) {
    return {
      name:          r.name          || r.Name          || r['Name of Contact'] || 'Unknown',
      designation:   r.designation   || r.Designation   || '',
      department:    r.department    || r.Department     || '',
      subdepartment: r.subdepartment || r.Subdepartment  || '',
      extension:     r.extension     || r.Extension      || '',
      email:         r.email         || r.Email          || '',
      mobile:        r.mobile        || r.Mobile         || ''
    };
  });
  var toAdd = mapped.filter(function(c) {
    return c.name && !contacts.some(function(ex) {
      return ex.name === c.name && ex.department === c.department && ex.extension === c.extension;
    });
  });
  if (!toAdd.length) { showNotice('info', 'All contacts already exist.'); return; }
  setSyncStatus('syncing', 'Importing…');
  toAdd.forEach(function(c) {
    c._id = 'S' + Date.now() + Math.random().toString(36).slice(2, 6);
    contacts.push(c);
  });
  rebuildTable();
  saveToServer(function() {
    showNotice('success', toAdd.length + ' contacts imported!');
  });
}

/* ═══════════════════════════════════════════
   NOTICE MODAL
═══════════════════════════════════════════ */
function showNotice(type, msg) {
  var titles = { error: 'Error', success: 'Done!', info: 'Information' };
  var colors = { error: '#c0392b', success: '#1a6b3a', info: '#1e3a52' };
  $('#noticeModalTitle').text(titles[type] || 'Notice').css('color', colors[type] || '#000');
  $('#noticeMessage').text(msg);
  $('#noticeModal').modal('show');
}

/* ═══════════════════════════════════════════
   UTILITY
═══════════════════════════════════════════ */
function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ═══════════════════════════════════════════
   DOCUMENT READY
═══════════════════════════════════════════ */
$(document).ready(function() {

  loadFromServer();

  /* ── Global search ── */
  $('#globalSearch').on('input', function() {
    if (table) table.search($(this).val()).draw();
  });

  /* ── Login / Logout ── */
  $('#loginBtn').on('click', function() {
    if (adminMode) {
      adminMode = false;
      updateAdminUI();
    } else {
      var pass = prompt('Enter admin password:');
      if (pass === null) return;
      /* Default password "Raffles2026" is used if none set on server yet */
      var checkPw = adminPassword || 'Raffles2026';
      if (pass === checkPw) { adminMode = true; updateAdminUI(); }
      else { showNotice('error', 'Incorrect password.'); }
    }
  });

  /* ── Department filter ── */
  $('#departmentFilter').on('change', function() {
    var dept = $(this).val();
    if (!table) return;
    table.column(deptColIdx())
      .search(dept ? '^' + $.fn.dataTable.util.escapeRegex(dept) + '$' : '', true, false)
      .draw();
  });

  /* ── Department change in form ── */
  $(document).on('change', '#department', function() {
    fillSubdepartmentOptions($(this).val());
  });

  /* ── Add Contact ── */
  $('#addContactBtn').on('click', function() {
    if (!adminMode) return;
    $('#addModal .modal-title').text('Add New Contact');
    populateForm({});
    $('#addModal').modal('show');
    $('#saveContact').off('click').on('click', doSaveNew);
  });

  function doSaveNew() {
    if (!validateForm()) { $('#formError').text('Please correct the highlighted errors.').removeClass('hidden'); return; }
    $('#formError').addClass('hidden');
    var contact = getFormData();
    addContact(contact, function() {
      $('#addModal').modal('hide');
      showNotice('success', 'Contact added!');
    });
  }

  /* ── Edit Contact ── */
  $('#contactTable').on('click', '.act-edit', function() {
    if (!adminMode) return;
    var data = table.row($(this).closest('tr')).data();
    if (!data) return;
    var id = data._id;
    $('#addModal .modal-title').text('Edit Contact');
    populateForm(data);
    $('#addModal').modal('show');
    $('#saveContact').off('click').on('click', function() {
      if (!validateForm()) { $('#formError').text('Please correct the highlighted errors.').removeClass('hidden'); return; }
      $('#formError').addClass('hidden');
      updateContact(id, getFormData(), function() {
        $('#addModal').modal('hide');
        $('#saveContact').off('click').on('click', doSaveNew);
        showNotice('success', 'Contact updated!');
      });
    });
  });

  /* ── Delete single ── */
  $('#contactTable').on('click', '.act-delete', function() {
    if (!adminMode) return;
    var data = table.row($(this).closest('tr')).data();
    if (!data) return;
    if (!confirm('Delete "' + (data.name || 'this contact') + '"? Cannot be undone.')) return;
    deleteContact(data._id, function() { showNotice('success', 'Contact deleted.'); });
  });

  /* ── Select All ── */
  $('#contactTable').on('change', '#selectAllContacts', function() {
    $('#contactTable tbody .contact-select').prop('checked', $(this).prop('checked'));
  });

  /* ── Delete Selected ── */
  $('#deleteSelectedBtn').on('click', function() {
    if (!adminMode) return;
    var ids = [];
    $('#contactTable tbody tr').each(function() {
      if ($(this).find('.contact-select').prop('checked')) {
        var d = table.row(this).data();
        if (d && d._id) ids.push(d._id);
      }
    });
    if (!ids.length) { showNotice('info', 'No contacts selected.'); return; }
    if (!confirm('Delete ' + ids.length + ' contacts? Cannot be undone.')) return;
    deleteManyContacts(ids, function() {
      $('#selectAllContacts').prop('checked', false);
      showNotice('success', ids.length + ' contact' + (ids.length > 1 ? 's' : '') + ' deleted.');
    });
  });

  /* ── Change Password ── */
  $('#changePasswordBtn').on('click', function() {
    if (!adminMode) return;
    var np = prompt('New admin password (min 8 characters):');
    if (!np) return;
    if (np.length < 8) { showNotice('error', 'Password must be at least 8 characters.'); return; }
    adminPassword = np;
    saveToServer(function() { showNotice('success', 'Password changed!'); });
  });

  /* ── Export JSON ── */
  $('#exportBtn').on('click', function() { if (adminMode) exportToJSON(); });

  /* ── Import JSON ── */
  $('#importJsonBtn').on('click', function() { if (adminMode) $('#importFileInput').val('').click(); });
  $('#importFileInput').on('change', function(e) {
    var file = e.target.files[0]; if (!file) return;
    var reader = new FileReader();
    reader.onload = function(ev) { try { importFromJSON(JSON.parse(ev.target.result)); } catch(e) { showNotice('error', 'Could not parse JSON.'); } };
    reader.readAsText(file);
  });

  /* ── Import Excel ── */
  $('#importExcelBtn').on('click', function() { if (adminMode) $('#importExcelInput').val('').click(); });
  $('#importExcelInput').on('change', function(e) { var file = e.target.files[0]; if (file) handleExcelFile(file); });
  $('#confirmExcelImport').on('click', function() { doExcelImport(); });

  /* ── Manage Departments ── */
  $('#manageDepartmentsBtn').on('click', function() {
    if (!adminMode) return;
    renderDepartmentsList(); $('#departmentsModal').modal('show');
  });
  $('#addDepartmentBtn').on('click', function() {
    var nd = $('#newDepartmentInput').val().trim();
    if (!nd) return;
    if (departments.indexOf(nd) !== -1) { showNotice('info', '"' + nd + '" already exists.'); return; }
    departments.push(nd);
    saveDepts(function() { renderDepartmentsList(); fillDepartmentOptions(); });
    $('#newDepartmentInput').val('');
  });
  $('#departmentsList').on('click', '.del-dep', function() {
    var i = parseInt($(this).data('i')), dn = departments[i];
    if (!confirm('Delete department "' + dn + '"? Contacts will be unassigned.')) return;
    departments.splice(i, 1);
    subdepartments = subdepartments.filter(function(s) { return s.department !== dn; });
    contacts.forEach(function(c) { if (c.department === dn) { c.department = ''; c.subdepartment = ''; } });
    rebuildTable();
    saveDepts(function() { renderDepartmentsList(); fillDepartmentOptions(); });
  });

  /* ── Manage Subdepartments ── */
  $('#manageSubdepartmentsBtn').on('click', function() {
    if (!adminMode) return;
    renderSubdepartmentsList(); fillDepartmentOptions(); $('#subdepartmentsModal').modal('show');
  });
  $('#addSubdepartmentBtn').on('click', function() {
    var ns = $('#newSubdepartmentInput').val().trim(), dep = $('#newSubdepartmentDepartment').val();
    if (!ns || !dep) return;
    if (subdepartments.some(function(s) { return s.name === ns && s.department === dep; })) {
      showNotice('info', '"' + ns + '" already exists under ' + dep + '.'); return;
    }
    subdepartments.push({ name: ns, department: dep });
    saveDepts(function() { renderSubdepartmentsList(); });
    $('#newSubdepartmentInput').val('');
  });
  $('#subdepartmentsList').on('click', '.del-subdep', function() {
    var i = parseInt($(this).data('i'));
    if (!confirm('Delete this subdepartment?')) return;
    subdepartments.splice(i, 1);
    saveDepts(function() { renderSubdepartmentsList(); });
  });

});
