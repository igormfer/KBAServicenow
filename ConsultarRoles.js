/**
 ****************************** Objetivo ******************************
 - Consultar usuários roles que consomem licenças.
 \___________________________________________________________________________________________/
 * UserRoleAuditFetcher — lista usuários (ativos) que possuem pelo menos uma das ROLE_NAMES,
 * trazendo também as roles que cada usuário possui (entre as pesquisadas).
 * Execução: Background Script (ServiceNow)
 */
 
(function () {
    // ---------------------------- Configuração ----------------------------
    var ROLE_NAMES = [
        'admin',
        'Change Management',
        'change_coordinator',
        'change_manager',
        'sn_change_cab.cab_manager',
        'sn_change_comments_write',
        'sn_chg_soc.change_soc_admin',
        'sn_sttrm_condition_read',
        'ia_admin',
        'incident_manager',
        'itil',
        'itil_admin',
        'major_incident_manager',
        'sn_comm_management.comm_plan_admin',
        'sn_incident_comments_write',
        'sn_incident_write',
        'sn_ind_tsm_core.noc_agent',
        'sn_service_desk_agent',
        'problem_admin',
        'problem_coordinator',
        'problem_manager',
        'problem_task_analyst',
        'sn_problem_comments_write',
        'sn_problem_write',
        'dm_user_criteria_read',
        'rm_product_user',
        'rm_release_phase_user',
        'rm_release_user',
        'sn_exam.catalog_admin',
        'sn_ind_tsm_core.noc.agent',
        'sn_request_comments_write',
        'sn_request_write',
        'sn_uni_requr_admin',
        'sn_uni_requr_service_owner',
        'sn_incident_read'
    ];
 
    var USER_DISPLAY_FIELD = 'user_name';  // mude para 'name' se quiser
    var IN_CHUNK_SIZE = 100;
 
    // ---------------------------- Helpers ----------------------------
    function isEmpty(arr) { return !arr || arr.length === 0; }
    function chunk(arr, size) {
        var out = [];
        for (var i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
        return out;
    }
 
    // Mapa principal: user_sys_id -> { sys_id, user_name, name, email, roles: {roleName: true, ...} }
    var usersMap = Object.create(null);
 
    if (isEmpty(ROLE_NAMES)) {
        gs.info('Nenhuma role informada. Encerrando.');
        return;
    }
 
    // ---------------------------- Coleta user->roles em uma única query ----------------------------
    var ur = new GlideRecord('sys_user_has_role');
    ur.addQuery('role.name', 'IN', ROLE_NAMES.join(','));
    ur.addQuery('user.active', true); // apenas usuários ativos
    ur.query();
 
    var userIds = [];
    var seenUser = Object.create(null);
 
    while (ur.next()) {
        var uid = ur.getValue('user') + '';
        var roleName = ur.getDisplayValue('role') || ''; // geralmente o "name" da role
 
        if (!usersMap[uid]) {
            usersMap[uid] = { sys_id: uid, user_name: '', name: '', email: '', roles: Object.create(null) };
        }
        if (roleName) {
            usersMap[uid].roles[roleName] = true;
        }
        if (!seenUser[uid]) {
            seenUser[uid] = true;
            userIds.push(uid);
        }
    }
 
    if (userIds.length === 0) {
        gs.info('Nenhum usuário encontrado com as roles especificadas (considerando apenas usuários ativos).');
        return;
    }
 
    // ---------------------------- Enriquecimento dos dados do usuário (em lote) ----------------------------
    var idChunks = chunk(userIds, IN_CHUNK_SIZE);
    for (var c = 0; c < idChunks.length; c++) {
        var ids = idChunks[c];
        var u = new GlideRecord('sys_user');
        u.addQuery('sys_id', 'IN', ids.join(','));
        u.query();
 
        while (u.next()) {
            var uid2 = u.getUniqueValue();
            var node = usersMap[uid2];
            if (node) {
                node.user_name = u.getValue('user_name') || '';
                node.name      = u.getValue('name') || '';
                node.email     = u.getValue('email') || '';
            }
        }
    }
 
    // ---------------------------- Ordenação e saída ----------------------------
    // ❗ FIX: use a lista userIds (ou Object.keys) em vez de hasOwnProperty em objeto sem protótipo
    var results = [];
    for (var i = 0; i < userIds.length; i++) {
        var k = userIds[i];
        var node = usersMap[k];
        if (node) results.push(node);
    }
 
    results.sort(function (a, b) {
        var av = (a[USER_DISPLAY_FIELD] || '').toLowerCase();
        var bv = (b[USER_DISPLAY_FIELD] || '').toLowerCase();
        if (av < bv) return -1;
        if (av > bv) return 1;
        return 0;
    });
 
    var header = 'Usuários (ativos) com as roles especificadas: ' + results.length;
    var lines = [];
    for (var j = 0; j < results.length; j++) {
        var r = results[j];
        var roleList = Object.keys(r.roles).sort().join(', ');
        // Formato: user_name | name | email | sys_id | roles (ordenadas)
        lines.push([
            r[USER_DISPLAY_FIELD],
            //r.name,
            //r.email,
            //r.sys_id,
            roleList
        ].join(' | '));
    }
 
    gs.info(header + '\n' + lines.join('\n'));
 
    // ---------------------------- (Opcional) distribuição por role ----------------------------
    /*
    var rc = new GlideAggregate('sys_user_has_role');
    rc.addQuery('role.name', 'IN', ROLE_NAMES.join(','));
    rc.addQuery('user.active', true);
    rc.groupBy('role.name');
    rc.addAggregate('COUNT');
    rc.query();
 
    var roleLines = [];
    while (rc.next()) {
        roleLines.push(rc.getValue('role.name') + ': ' + rc.getAggregate('COUNT'));
    }
    gs.info('Distribuição por role:\n' + roleLines.sort().join('\n'));
    */
})();
 
