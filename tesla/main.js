// Twitch Filtered Chat
// Tesla variant

var EscapeCharsList = ['&', '"', "'", '<', '>'];
var EscapeChars = {
    '&': '&amp;',
    '"': '&quot;',
    "'": '&apos;',
    '<': '&lt;',
    '>': '&gt;'
};

function EscapeString(s) {
    s = s.replace(/&/g, '&amp;');
    s = s.replace(/"/g, '&quot;');
    s = s.replace(/'/g, '&apos;');
    s = s.replace(/</g, '&lt;');
    s = s.replace(/>/g, '&gt;');
    return s;
}

var client //twitch irc client
    , queryList = {} //query string params
    , global_badges = {} //all global badges
    , channelTimerId = -1 //delay for changing channel text box
    , channel_badges = {} //all channel-specific badges
    , user_undefined_colors = {} //list of users with no defined color, to store a randomly chosen color
    , message_history = []
    , message_history_length = 500
    , debug = (document.location.protocol == "file:")
    ;

var _emoteReq,
    validEmotes = [],
    cheerLevels = [],
    valid_cheers = [];

// Configuration object
var config = {
    Channel: ''
};

function onLoadChannelBadges(json) {
    if (json.badge_sets.bits) {
        for (b in json.badge_sets.bits.versions) {
            channel_badges[`bits/${b}`] = json.badge_sets.bits.versions[b]["image_url_1x"];
        }
    }
    if (json.badge_sets.subscriber) {
        for (b in json.badge_sets.subscriber.versions) {
            channel_badges[`subscriber/${b}`] = json.badge_sets.subscriber.versions[b]["image_url_1x"];
        }
    }
}

function onLoadGlobalBadges(json) {
    for (s in json.badge_sets) {
        for (v in json.badge_sets[s].versions) {
            var key = s + "/" + v
            global_badges[key] = json.badge_sets[s].versions[v]["image_url_1x"];
        }
    }
}

function onLoadCheerEmotes(json) {
    for (i in json.actions) {
        var p = json.actions[i].prefix.toLowerCase();
        valid_cheers[p] = [];
        for (t in json.actions[i].tiers) {
            valid_cheers[p].push({
                bits: json.actions[i].tiers[t].min_bits,
                color: json.actions[i].tiers[t].color
            });
        }
    }
}

(function() {
    if (window.location.search) {
        var query = window.location.search;
        var queryParts = query.substring(1).split('&');
        for (var i = 0; i < queryParts.length; i++) {
            var parts = queryParts[i].split('=');
            queryList[parts[0].trim()] = decodeURIComponent(parts[1].trim());
        }
    }

    try {
        var confStr = localStorage.getItem('config');
        if (confStr) {
            config = JSON.parse(confStr);
            if (config) {
                txtChannel.value = config.Channel;
            }
        }
    }
    catch{ }

    /* Query String values override local storage for channel and username */
    if (queryList.hasOwnProperty('channel')) {
        txtChannel.value = queryList.channel;
    }
    if (queryList.hasOwnProperty('user')) {
        txtNick.value = queryList.user;
    }

    $('.module').each(function () {
        var id = $(this).attr('id');

        if (!config[id])
            UpdateConfig($(this).attr('id'));
        else {
            $(this).find('label.name').html(config[id].Name);
            $(this).find('input.name').val(config[id].Name);
            if (config[id].Pleb)
                $(this).find('input.pleb').attr('checked', 'checked');
            else
                $(this).find('input.pleb').removeAttr('checked');

            if (config[id].Sub)
                $(this).find('input.sub').attr('checked', 'checked');
            else
                $(this).find('input.sub').removeAttr('checked');

            if (config[id].Mod)
                $(this).find('input.mod').attr('checked', 'checked');
            else
                $(this).find('input.mod').removeAttr('checked');

            if (config[id].Event)
                $(this).find('input.event').attr('checked', 'checked');
            else
                $(this).find('input.event').removeAttr('checked');

            if (config[id].Bits)
                $(this).find('input.bits').attr('checked', 'checked');
            else
                $(this).find('input.bits').removeAttr('checked');

            for (s of config[id].IncludeUser) {
                var li = `<li><label><input type="checkbox" value="${s}" class="include_user" checked />From user: ${s}</label></li>`
                $(this).find('li.include_user').before(li);
            }

            for (s of config[id].IncludeKeyword) {
                var li = `<li><label><input type="checkbox" value="${s}" class="include_keyword" checked />Contains: ${s}</label></li>`
                $(this).find('li.include_keyword').before(li);
            }

            for (s of config[id].ExcludeUser) {
                var li = `<li><label><input type="checkbox" value="${s}" class="exclude_user" checked />From user: ${s}</label></li>`
                $(this).find('li.exclude_user').before(li);
            }

            for (s of config[id].ExcludeStartsWith) {
                var li = `<li><label><input type="checkbox" value="${s}" class="exclude_startswith" checked />Starts with: ${s}</label></li>`
                $(this).find('li.exclude_startswith').before(li);
            }
        }
    });

    LoadGlobalBadges(onLoadGlobalBadges);
    LoadCheerEmotes('254ae3otzi9r7ghkl56p8d8ijctwq5', onLoadCheerEmotes);

    $('#txtChannel').on('input', function () {
        if (txtNick.value == '' || txtChannel.value.indexOf(txtNick.value) == 0)
            txtNick.value = txtChannel.value;
    });

    $('#settings').on('input', 'input', UpdateChannelTimer)
        .keyup(function (e) {
            if (e.keyCode == 13) {
                $('#settings_button').click();
            }
        })

    $('#settings_button').click(function () {
        if ($('#settings').is(':visible'))
            $('#settings').fadeOut();
        else
            $('#settings').fadeIn();
    });

    $('.menu').click(function () {
        var $lbl = $(this).parent().children('label'),
            $tb = $(this).parent().children('input');
        if ($(this).parent().hasClass('open')) {
            $(this).parent().removeClass('open');
            $lbl.html($tb.val());
            UpdateConfig($(this).closest('.module').attr('id'));
        } else {
            $(this).parent().addClass('open');
            $tb.val($lbl.html());
        }
    });

    $('.module .settings input[type="text"]').on('keyup', function (e) {
        if (e.keyCode == 13) {
            var cls = $(this).closest('li').attr('class').replace('textbox', '').trim();
            var $li = $(`<li><label><input type="checkbox" value="${$(this).val()}" class="${cls}" checked />${$(this).closest('li').find('label').html()} ${$(this).val()}</label></li>`);
            $(this).closest('li').before($li);
            $(this).val('');
        }
    });

    InitClient();
})();

function UpdateChannelTimer() {
    clearTimeout(channelTimerId);
    channelTimerId = setTimeout(UpdateChannel, 500);
}

function UpdateChannel() {
    InitClient();
    //client.LeaveChannels(client.Channels[0]);

    config.Channel = txtChannel.value.toLowerCase();

    //client.JoinChannels(txtChannel.value.toLowerCase());
    localStorage.setItem('config', JSON.stringify(config));
}

function UpdateConfig(module) {
    var $module = $('#' + module);

    var o = {
        Name: $module.find('label.name').html(),
        Pleb: $module.find('input.pleb').is(':checked'),
        Sub: $module.find('input.sub').is(':checked'),
        Mod: $module.find('input.mod').is(':checked'),
        Event: $module.find('input.event').is(':checked'),
        Bits: $module.find('input.bits').is(':checked'),
        IncludeUser: [],
        IncludeKeyword: [],
        ExcludeUser: [],
        ExcludeStartsWith: []
    };

    $module.find('input.include_user:checked').each(function () {
        o.IncludeUser.push($(this).val());
    });
    $module.find('input.include_keyword:checked').each(function () {
        o.IncludeKeyword.push($(this).val());
    });
    $module.find('input.exclude_user:checked').each(function () {
        o.ExcludeUser.push($(this).val());
    });
    $module.find('input.exclude_startswith:checked').each(function () {
        o.ExcludeStartsWith.push($(this).val());
    });
    config[module] = o;

    localStorage.setItem('config', JSON.stringify(config));
}

function InitClient() {
    client = new TwitchClient({
        Channels: txtChannel.value,
        Debug: debug
    });

    client.onRoomstate = function (channel, settings) {
        console.log('Joined channel', channel, settings['room-id']);
        LoadChannelBadges(settings['room-id'], onLoadChannelBadges);
    };

    client.onPrivmsg = function (user, channel, message, userData, rawMessage) {
        if (message_history[message_history.length - 1] == rawMessage)
            return;

        if (message_history.length == message_history_length)
            message_history.shift();

        message_history.push(rawMessage);

        var p = ParseMessage(user, message, userData);

        //go through each module and append the message
        $('.module').each(function () {
            var id = $(this).attr('id');
            var $content = $(this).find('.content');

            var el = $content[0],
                scroll = false;

            if (el.clientHeight + el.scrollTop >= el.scrollHeight - 100)
                scroll = true;

            var disp = false;

            //plebs
            if (config[id].Pleb && !userData['subscriber'])
                disp = true;

            //subs
            if (config[id].Sub && userData['subscriber'])
                disp = true;

            //mods
            if (config[id].Mod && userData['mod'])
                disp = true;

            if (config[id].Bits && userData['bits'])
                disp = true;

            for (s of config[id].IncludeUser) {
                if (user.toLowerCase() == s.toLowerCase())
                    disp = true;
            }

            for (s of config[id].IncludeKeyword) {
                if (message.toLowerCase().indexOf(s.toLowerCase()) > -1)
                    disp = true;
            }

            for (s of config[id].ExcludeUser) {
                if (user.toLowerCase() == s.toLowerCase())
                    disp = false;
            }

            for (s of config[id].ExcludeStartsWith) {
                if (message.toLowerCase().indexOf(s.toLowerCase()) == 0)
                    disp = false;
            }

            if (disp)
                $content.append(p);

            if (scroll)
                el.scrollTop = el.scrollHeight;
        });

    };

    client.onUsernotice = function (message) {
        if (message_history.length == message_history_length)
            message_history.shift();
        message_history.push(message);
    };

    function _build_callback(name) {
        return function () {
            console.log(name, arguments);
        };
    }

    // onJoin(user, channel)
    client.onJoin = _build_callback('client.onJoin');
    // onPart(user, channel)
    client.onPart = _build_callback('client.onPart');
    // onMessage(line)
    client.onMessage = _build_callback('client.onMessage');

    // onSub(line) callbacks
    client.onSub = _build_callback('client.onSub');
    client.onReSub = _build_callback('client.onReSub');
    client.onGiftSub = _build_callback('client.onGiftSub');
    client.onAnonGiftSub = _build_callback('client.onAnonGiftSub');
}

function ParseEmotes(userData, message, force_start, noesc) {
    // Allow an override "string does not start at zero" for prefix removal
    if (force_start === undefined) { force_start = 0; }
    // Bypass escaping logic if needed
    if (noesc === undefined) { noesc = false; }

    // Calculate offset adjustments based on escaping
    var adjusted = [];
    var adjustment = 0;
    for (var i = 0; i < message.length; ++i) {
        if (message[i] in EscapeChars && !noesc) {
            adjustment += EscapeChars[message[i]].length - message[i].length;
        }
        adjusted.push(i + adjustment);
    }

    // Parse the emotes, taking into account any adjustments
    var emoteParts = userData.emotes.split('/'),
        emoteList = [];
    for (var i in emoteParts) {
        var emoteId = emoteParts[i].split(':')[0];
        var emoteLocations = emoteParts[i].split(':')[1].split(',');
        for (var l in emoteLocations) {
            var start = parseInt(emoteLocations[l].split('-')[0], 10);
            var end = parseInt(emoteLocations[l].split('-')[1], 10);
            emoteList.push({
                id: emoteId,
                img: `<img src="https://static-cdn.jtvnw.net/emoticons/v1/${emoteId}/1.0" />`,
                start: adjusted[start] - force_start,
                end: adjusted[end] - force_start
            });
        }
    }

    // Sort for in-place string replacing later
    emoteList.sort((a, b) => b.start - a.start);

    return emoteList;
}

function ParseMessage(user, message, userData) {
    // Use specified color if there is one; if not, pick a random one from the
    // defaults and store it
    var user_col = userData['color'];
    if (user_col == '') {
        if (!user_undefined_colors[user]) {
            user_undefined_colors[user] = GetRandomColor();
        }
        user_col = user_undefined_colors[user];
    }
    var stroke_col = GetStrokeColor(user_col, "#000000");
    var message_col = '';
    var is_action = false;
    if (message.indexOf('ACTION') == 0) {
        is_action = true;
        message_col = `color: ${user_col}`;
        message = message.substring(8, message.length - 1);
    }

    var line_classes = ["line-text"];
    var line_styles = [];
    var wrapper_classes = ["line-wrapper"];
    var wrapper_styles = [];
    var line_html_pre = [];
    var line_html_post = [];
    var wrapper_html_pre = [];
    var wrapper_html_post = [];

    /*
    var message_pre = '';
    var message_post = '';
    */

    // Allow super-users to bypass escaping and force cheers
    var noesc = false;
    var admin_script = false;
    if (super_users.hasOwnProperty(userData["display-name"])) {
        if (message.split(' ')[0] == 'force') {
            noesc = true;
        } else if (message.split(' ')[0] == 'forcebits') {
            userData.bits = 10000;
            message = 'cheer10000 ' + message.substr('forcebits '.length);
        } else if (message.split(' ')[0] == 'forcejs') {
            noesc = true;
            admin_script = true;
            message = message.substr('forcejs '.length);
        }
    }

    // Parse emotes before escaping string
    var emoteList = [];
    if (userData.emotes != "") {
        emoteList = ParseEmotes(userData, message, 0, noesc);
    }

    // Actually escape the string
    if (!noesc) {
        message = EscapeString(message);
    }

    // replace chat emote keywords with actual emote images
    if (userData.emotes != "") {
        for (var i in emoteList) {
            message = message.substring(0, emoteList[i].start)
                + emoteList[i].img
                + message.substring(emoteList[i].end + 1);
        }
    }

    // get badges from channel list if it exists; if not, use global list
    var badge_text = '';
    if (userData['badges'] != "") {
        var badges = userData["badges"].split(',');
        for (i in badges) {
            if (channel_badges[badges[i]])
                badge_text += `<img src="${channel_badges[badges[i]]}" />`;
            else
                badge_text += `<img src="${global_badges[badges[i]]}" />`;
        }
        badge_text = '<span class="badges">' + badge_text + '</span>';
    }

    // bit parsing
    if (userData.bits) {
        var bitsLeft = userData.bits;
        var cheerTest = /^([a-z]+)(\d+)$/;
        var msgWords = message.toLowerCase().split(' '),
            msg_out = '';
        for (i in msgWords) {
            if (cheerTest.test(msgWords[i])) {
                var cheerResult = cheerTest.exec(msgWords[i]);
                var prefix = '';
                for (c_i in valid_cheers) {
                    if (c_i == cheerResult[1]) {
                        prefix = c_i;
                        break;
                    }
                }
                if (prefix != '') {
                    var tier = 0,
                        col = '';
                    for (j of valid_cheers[prefix]) {
                        if (cheerResult[2] >= j.bits) {
                            tier = j.bits;
                            col = j.color;
                        } else {
                            break;
                        }
                    }
                    // handle custom cheer formatting commands
                    var wi = parseInt(i) + 1;
                    while (wi < msgWords.length) {
                        var sdef = undefined;
                        if (css_styles.hasOwnProperty(msgWords[wi])) {
                            /* Valid effect */
                            sdef = css_styles[msgWords[wi]];
                        } else if (colors.hasOwnProperty(msgWords[wi])) {
                            /* Valid color */
                            sdef = css_color_style(msgWords[wi]);
                        }
                        if (sdef !== undefined && !sdef._disabled) {
                            if (bitsLeft >= sdef.cost) {
                                /* Can afford; apply it */
                                bitsLeft -= sdef.cost;
                                if (sdef.class) { line_classes.push(sdef.class); }
                                if (sdef.wclass) { wrapper_classes.push(sdef.wclass); }
                                if (sdef.style) { line_styles.push(sdef.style); }
                                if (sdef.wstyle) { wrapper_styles.push(sdef.wstyle); }
                                if (sdef.html_pre) { line_html_pre.push(sdef.html_pre); }
                                if (sdef.html_post) { line_html_post.push(sdef.html_post); }
                                if (sdef.whtml_pre) { wrapper_html_pre.push(sdef.whtml_pre); }
                                if (sdef.whtml_post) { wrapper_html_post.push(sdef.whtml_post); }
                            }
                        } else {
                            break;
                        }
                        /*if (valid_styles.hasOwnProperty(msgWords[wi])) {
                            sdef = valid_styles[msgWords[wi]];
                        } else if (msgWords[wi] in colors) {
                            // hard-coded: colors cost 1 bit
                            sdef = { cost: 1, value: [`<span style="color:${colors[msgWords[wi]]};">`, `</span>`] };
                        } else {
                            break;
                        }
                        if (sdef.cost <= bitsLeft) {
                            // can afford
                            message_pre = message_pre + sdef.value[0];
                            message_post = sdef.value[1] + message_post;
                            bitsLeft -= sdef.cost;
                        } else {
                            break;
                        }*/
                        wi += 1;
                    }
                    msg_out += `<span style="color:${col};font-weight:bold;"><img src="https://d3aqoihi2n8ty8.cloudfront.net/actions/${prefix}/dark/animated/${tier}/1.gif" /> ${cheerResult[2]}</span> `
                } else {
                    msg_out += msgWords[i] + ' ';
                }
            } else {
                msg_out += msgWords[i] + ' ';
            }
        }
        message = msg_out;
    }

    //link parsing
    message = message + ' ';
    var startIdx = 0, endIdx = 0;
    while (startIdx > -1 && startIdx < (message.length - 1)) {
        endIdx = message.indexOf(' ', startIdx + 1);
        var word = message.substring(startIdx, endIdx).trim();
        var word_l = word.toLowerCase();
        if (word_l.indexOf('www') == 0 || word_l.indexOf('http://') == 0 || word_l.indexOf('https://') == 0) {
            var scheme = word_l.indexOf('http') != 0 ? 'https://' : '';
            var href = scheme + word;
            var text = word;
            var s = `<a target="_blank" href="${href}">${text}</a>`;
            message = message.substring(0, startIdx) + ' ' + s + message.substring(endIdx);
        }
        startIdx = message.indexOf(' ', startIdx + 1);
    }
    message = message.trim();
    var text_shadow = `text-shadow:
    1px 1px 0 ${stroke_col},
    -1px 1px 0 ${stroke_col},
    1px -1px 0 ${stroke_col},
    -1px -1px 0 ${stroke_col}`;

    /* Special handling for /me messages */
    if (is_action) {
        line_styles.push(message_col);
        line_html_pre.unshift("&nbsp;");
    } else {
        line_html_pre.unshift(":&nbsp;");
    }

    /* Create the message HTML */
    var classes = line_classes.join(" ");
    var styles = line_styles.join(";");
    var wclasses = wrapper_classes.join(" ");
    var wstyles = wrapper_styles.join(";");
    var html_pre = line_html_pre.join("");
    var html_post = line_html_post.join("");
    var whtml_pre = wrapper_html_pre.join("");
    var whtml_post = wrapper_html_post.join("");

    var line = "";
    line += `${whtml_pre}<div class="${wclasses}" style="${wstyles}">`;
    line += badge_text;
    line += `<span class="username" style="color: ${user_col}; ${text_shadow}">`;
    line += userData["display-name"];
    line += `</span>`;
    line += html_pre;
    line += `<span class="${classes}" style="${styles}">`;
    if (admin_script) {
        line += "<script type=\"text/javascript\">";
    }
    line += message;
    if (admin_script) {
        line += "</script>";
    }
    line += `</span>`;
    line += html_post;
    line += `</div>${whtml_post}`;
    console.log(line);
    return line;

    /*
    var p = `<p>${badge_text}` +
            ` <span class="username" style="color: ${user_col}; ${text_shadow};">${userData["display-name"]}</span>` +
            `${message_col == '' ? ":" : ""}` +
            ` <span style="${message_col}">${message_pre}${message}${message_post}</span>`;

    return p;
    */
}

// vim:ts=4:sts=4:sw=4:et
