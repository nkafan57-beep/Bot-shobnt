
const { Client, GatewayIntentBits, SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ChannelType, REST, Routes, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const http = require('http');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// تخزين معلومات الغرف المؤقتة
const tempRooms = new Map();
const mentionCounts = new Map();
const allowedUsers = new Map();

// تخزين أسعار التجديد والمنشنات
const pricing = new Map(); // guildId -> { renewalPrices: [], mentionPrices: { everyone: 0, here: 0, shop: 0 }, command: '' }
const ticketCounters = new Map(); // guildId -> { renewal: 0, mention: 0 }

// أوامر السلاش
const commands = [
    new SlashCommandBuilder()
        .setName('create-room')
        .setDescription('إنشاء غرفة مؤقتة مع صلاحيات منشن محددة')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('المستخدم الذي يمكنه التحدث في الغرفة')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('everyone-mentions')
                .setDescription('عدد منشنات @everyone المسموحة')
                .setRequired(true)
                .setMinValue(0)
                .setMaxValue(10))
        .addIntegerOption(option =>
            option.setName('here-mentions')
                .setDescription('عدد منشنات @here المسموحة')
                .setRequired(true)
                .setMinValue(0)
                .setMaxValue(10))
        .addIntegerOption(option =>
            option.setName('duration-days')
                .setDescription('مدة الغرفة بالأيام')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(30))
        .addRoleOption(option =>
            option.setName('shop-role')
                .setDescription('رتبة المتجر للمنشن')
                .setRequired(false))
        .addIntegerOption(option =>
            option.setName('shop-mentions')
                .setDescription('عدد منشنات المتجر المسموحة')
                .setRequired(false)
                .setMinValue(0)
                .setMaxValue(10))
        .addStringOption(option =>
            option.setName('room-name')
                .setDescription('اسم الغرفة')
                .setRequired(false)),

    new SlashCommandBuilder()
        .setName('تجديد-المتجر')
        .setDescription('تجديد الغرفة المؤقتة مع إضافة وقت ومنشنات إضافية')
        .addChannelOption(option =>
            option.setName('الغرفة')
                .setDescription('الغرفة المراد تجديدها')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('أيام-إضافية')
                .setDescription('عدد الأيام الإضافية')
                .setRequired(false)
                .setMinValue(1)
                .setMaxValue(30))
        .addIntegerOption(option =>
            option.setName('منشنات-everyone-إضافية')
                .setDescription('عدد منشنات @everyone الإضافية')
                .setRequired(false)
                .setMinValue(0)
                .setMaxValue(10))
        .addIntegerOption(option =>
            option.setName('منشنات-here-إضافية')
                .setDescription('عدد منشنات @here الإضافية')
                .setRequired(false)
                .setMinValue(0)
                .setMaxValue(10))
        .addIntegerOption(option =>
            option.setName('منشنات-متجر-إضافية')
                .setDescription('عدد منشنات المتجر الإضافية')
                .setRequired(false)
                .setMinValue(0)
                .setMaxValue(10)),

    new SlashCommandBuilder()
        .setName('set-permissions')
        .setDescription('تحديد من يمكنه استخدام أمر إنشاء الغرف')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('المستخدم المسموح له')
                .setRequired(false))
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('الرتبة المسموح لها')
                .setRequired(false)),

    new SlashCommandBuilder()
        .setName('تسطيب-أسعار-التجديد')
        .setDescription('تحديد أسعار تجديد المتجر حسب عدد الأيام')
        .addIntegerOption(option =>
            option.setName('يوم-واحد')
                .setDescription('سعر اليوم الواحد')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('يومين')
                .setDescription('سعر اليومين')
                .setRequired(false))
        .addIntegerOption(option =>
            option.setName('ثلاثة-أيام')
                .setDescription('سعر الثلاثة أيام')
                .setRequired(false))
        .addIntegerOption(option =>
            option.setName('أربعة-أيام')
                .setDescription('سعر الأربعة أيام')
                .setRequired(false))
        .addIntegerOption(option =>
            option.setName('خمسة-أيام')
                .setDescription('سعر الخمسة أيام')
                .setRequired(false))
        .addIntegerOption(option =>
            option.setName('ستة-أيام')
                .setDescription('سعر الستة أيام')
                .setRequired(false))
        .addIntegerOption(option =>
            option.setName('أسبوع')
                .setDescription('سعر الأسبوع')
                .setRequired(false)),

    new SlashCommandBuilder()
        .setName('تسطيب-أسعار-المنشنات')
        .setDescription('تحديد أسعار المنشنات')
        .addIntegerOption(option =>
            option.setName('سعر-everyone')
                .setDescription('سعر منشن @everyone')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('سعر-here')
                .setDescription('سعر منشن @here')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('سعر-متجر')
                .setDescription('سعر منشن المتجر')
                .setRequired(true)),

    new SlashCommandBuilder()
        .setName('تسطيب-امر-الدفع')
        .setDescription('تحديد نص أمر الدفع (مثل: C رقم @شخص)')
        .addStringOption(option =>
            option.setName('الامر')
                .setDescription('نص الأمر بدون الرقم والمنشن')
                .setRequired(true))
];

client.once('ready', async () => {
    console.log(`تم تسجيل الدخول كـ ${client.user.tag}!`);

    // تسجيل الأوامر
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);

    try {
        console.log('بدء تحديث أوامر السلاش...');

        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands }
        );

        console.log('تم تحديث أوامر السلاش بنجاح!');
    } catch (error) {
        console.error('خطأ في تحديث الأوامر:', error);
    }

    // إعداد حالة البوت مع تدوير الرسائل
    const statusMessages = [
        'ntl studio',
        'developer ntlkafan',
        'create by ntl server'
    ];

    let currentIndex = 0;

    client.user.setPresence({
        activities: [{
            name: statusMessages[currentIndex],
            type: 3
        }],
        status: 'online'
    });

    setInterval(() => {
        currentIndex = (currentIndex + 1) % statusMessages.length;
        client.user.setPresence({
            activities: [{
                name: statusMessages[currentIndex],
                type: 3
            }],
            status: 'online'
        });
    }, 10000);
});

client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;

        if (commandName === 'تسطيب-أسعار-التجديد') {
            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
                return interaction.reply({ content: 'ليس لديك صلاحية لاستخدام هذا الأمر!', ephemeral: true });
            }

            const guildId = interaction.guild.id;
            if (!pricing.has(guildId)) {
                pricing.set(guildId, { renewalPrices: [], mentionPrices: { everyone: 0, here: 0, shop: 0 }, command: 'C' });
            }

            const prices = [];
            prices[1] = interaction.options.getInteger('يوم-واحد');
            prices[2] = interaction.options.getInteger('يومين') || 0;
            prices[3] = interaction.options.getInteger('ثلاثة-أيام') || 0;
            prices[4] = interaction.options.getInteger('أربعة-أيام') || 0;
            prices[5] = interaction.options.getInteger('خمسة-أيام') || 0;
            prices[6] = interaction.options.getInteger('ستة-أيام') || 0;
            prices[7] = interaction.options.getInteger('أسبوع') || 0;

            pricing.get(guildId).renewalPrices = prices;

            await interaction.reply({ content: 'تم تحديث أسعار التجديد بنجاح!', ephemeral: true });
        }

        if (commandName === 'تسطيب-أسعار-المنشنات') {
            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
                return interaction.reply({ content: 'ليس لديك صلاحية لاستخدام هذا الأمر!', ephemeral: true });
            }

            const guildId = interaction.guild.id;
            if (!pricing.has(guildId)) {
                pricing.set(guildId, { renewalPrices: [], mentionPrices: { everyone: 0, here: 0, shop: 0 }, command: 'C' });
            }

            pricing.get(guildId).mentionPrices = {
                everyone: interaction.options.getInteger('سعر-everyone'),
                here: interaction.options.getInteger('سعر-here'),
                shop: interaction.options.getInteger('سعر-متجر')
            };

            await interaction.reply({ content: 'تم تحديث أسعار المنشنات بنجاح!', ephemeral: true });
        }

        if (commandName === 'تسطيب-امر-الدفع') {
            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
                return interaction.reply({ content: 'ليس لديك صلاحية لاستخدام هذا الأمر!', ephemeral: true });
            }

            const guildId = interaction.guild.id;
            if (!pricing.has(guildId)) {
                pricing.set(guildId, { renewalPrices: [], mentionPrices: { everyone: 0, here: 0, shop: 0 }, command: 'C' });
            }

            pricing.get(guildId).command = interaction.options.getString('الامر');

            await interaction.reply({ content: 'تم تحديث أمر الدفع بنجاح!', ephemeral: true });
        }

        if (commandName === 'set-permissions') {
            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
                return interaction.reply({ content: 'ليس لديك صلاحية لاستخدام هذا الأمر!', ephemeral: true });
            }

            const user = interaction.options.getUser('user');
            const role = interaction.options.getRole('role');

            if (!user && !role) {
                return interaction.reply({ content: 'يجب تحديد مستخدم أو رتبة على الأقل!', ephemeral: true });
            }

            const guildId = interaction.guild.id;
            if (!allowedUsers.has(guildId)) {
                allowedUsers.set(guildId, { users: [], roles: [] });
            }

            if (user) {
                allowedUsers.get(guildId).users.push(user.id);
            }
            if (role) {
                allowedUsers.get(guildId).roles.push(role.id);
            }

            let response = 'تم تحديث الصلاحيات:\n';
            if (user) response += `• المستخدم: ${user.tag}\n`;
            if (role) response += `• الرتبة: ${role.name}\n`;

            await interaction.reply({ content: response, ephemeral: true });
        }

        if (commandName === 'تجديد-المتجر') {
            const guildId = interaction.guild.id;
            const userId = interaction.user.id;
            const memberRoles = interaction.member.roles.cache.map(role => role.id);

            if (allowedUsers.has(guildId)) {
                const allowed = allowedUsers.get(guildId);
                const hasUserPermission = allowed.users.includes(userId);
                const hasRolePermission = allowed.roles.some(roleId => memberRoles.includes(roleId));

                if (!hasUserPermission && !hasRolePermission && !interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
                    return interaction.reply({ content: 'ليس لديك صلاحية لاستخدام هذا الأمر!', ephemeral: true });
                }
            } else if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
                return interaction.reply({ content: 'ليس لديك صلاحية لاستخدام هذا الأمر!', ephemeral: true });
            }

            const channel = interaction.options.getChannel('الغرفة');
            const additionalDays = interaction.options.getInteger('أيام-إضافية') || 0;
            const additionalEveryone = interaction.options.getInteger('منشنات-everyone-إضافية') || 0;
            const additionalHere = interaction.options.getInteger('منشنات-here-إضافية') || 0;
            const additionalShop = interaction.options.getInteger('منشنات-متجر-إضافية') || 0;

            const roomData = tempRooms.get(channel.id);
            if (!roomData) {
                return interaction.reply({ content: 'هذه الغرفة ليست غرفة مؤقتة!', ephemeral: true });
            }

            if (additionalDays > 0) {
                roomData.duration += additionalDays * 24 * 60 * 60 * 1000;
            }
            if (additionalEveryone > 0) {
                roomData.everyoneMentions += additionalEveryone;
            }
            if (additionalHere > 0) {
                roomData.hereMentions += additionalHere;
            }
            if (additionalShop > 0) {
                roomData.shopMentions += additionalShop;
            }

            tempRooms.set(channel.id, roomData);

            const timeLeft = roomData.duration - (Date.now() - roomData.createdAt);
            const daysLeft = Math.ceil(timeLeft / (24 * 60 * 60 * 1000));

            const mentionKey = `${channel.id}-${roomData.userId}`;
            const currentCounts = mentionCounts.get(mentionKey) || { everyone: 0, here: 0, shop: 0 };

            const embed = new EmbedBuilder()
                .setTitle('🔄 تم تجديد الغرفة المؤقتة')
                .setColor(0x00AE86)
                .addFields(
                    { name: '👤 المستخدم المختار', value: `<@${roomData.userId}>`, inline: true },
                    { name: '📅 الوقت المتبقي', value: `${daysLeft} أيام`, inline: true },
                    { name: '🌍 منشنات @everyone', value: `${currentCounts.everyone}/${roomData.everyoneMentions}`, inline: true },
                    { name: '📍 منشنات @here', value: `${currentCounts.here}/${roomData.hereMentions}`, inline: true }
                );

            if (roomData.shopRole) {
                embed.addFields(
                    { name: '🏪 رتبة المتجر', value: `<@&${roomData.shopRole}>`, inline: true },
                    { name: '🛒 منشنات المتجر', value: `${currentCounts.shop}/${roomData.shopMentions}`, inline: true }
                );
            }

            if (additionalDays > 0 || additionalEveryone > 0 || additionalHere > 0 || additionalShop > 0) {
                let renewalText = '✅ **تم إضافة:**\n';
                if (additionalDays > 0) renewalText += `• ${additionalDays} أيام إضافية\n`;
                if (additionalEveryone > 0) renewalText += `• ${additionalEveryone} منشنات @everyone إضافية\n`;
                if (additionalHere > 0) renewalText += `• ${additionalHere} منشنات @here إضافية\n`;
                if (additionalShop > 0) renewalText += `• ${additionalShop} منشنات متجر إضافية\n`;

                embed.addFields({ name: '🆕 التجديد', value: renewalText, inline: false });
            }

            embed.addFields(
                { name: '⚠️ تحذير', value: 'إذا تم تجاوز العدد المسموح من المنشنات، ستتم إزالة صلاحياتك أو حذف الغرفة!', inline: false }
            );

            embed.setTimestamp();

            const originalMessage = await channel.messages.fetch(roomData.messageId);
            await originalMessage.edit({ embeds: [embed] });

            await interaction.reply({ content: `تم تجديد الغرفة <#${channel.id}> بنجاح!`, ephemeral: true });
        }

        if (commandName === 'create-room') {
            const guildId = interaction.guild.id;
            const userId = interaction.user.id;
            const memberRoles = interaction.member.roles.cache.map(role => role.id);

            if (allowedUsers.has(guildId)) {
                const allowed = allowedUsers.get(guildId);
                const hasUserPermission = allowed.users.includes(userId);
                const hasRolePermission = allowed.roles.some(roleId => memberRoles.includes(roleId));

                if (!hasUserPermission && !hasRolePermission && !interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
                    return interaction.reply({ content: 'ليس لديك صلاحية لاستخدام هذا الأمر!', ephemeral: true });
                }
            } else if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
                return interaction.reply({ content: 'ليس لديك صلاحية لاستخدام هذا الأمر!', ephemeral: true });
            }

            const targetUser = interaction.options.getUser('user');
            const everyoneMentions = interaction.options.getInteger('everyone-mentions');
            const hereMentions = interaction.options.getInteger('here-mentions');
            const shopRole = interaction.options.getRole('shop-role');
            const shopMentions = interaction.options.getInteger('shop-mentions') || 0;
            const durationDays = interaction.options.getInteger('duration-days');
            const roomName = interaction.options.getString('room-name') || `غرفة-${targetUser.username}`;

            try {
                const channel = await interaction.guild.channels.create({
                    name: roomName,
                    type: ChannelType.GuildText,
                    permissionOverwrites: [
                        {
                            id: interaction.guild.roles.everyone,
                            deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.ViewChannel],
                        },
                        {
                            id: targetUser.id,
                            allow: [
                                PermissionFlagsBits.SendMessages,
                                PermissionFlagsBits.ViewChannel,
                                PermissionFlagsBits.MentionEveryone
                            ],
                        },
                    ],
                });

                // إنشاء الأزرار
                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('shop_renewal')
                            .setLabel('تجديد متجر')
                            .setStyle(ButtonStyle.Primary)
                            .setEmoji('🔄'),
                        new ButtonBuilder()
                            .setCustomId('buy_mentions')
                            .setLabel('شراء منشن')
                            .setStyle(ButtonStyle.Success)
                            .setEmoji('🛒')
                    );

                const embed = new EmbedBuilder()
                    .setTitle('🏠 تم إنشاء الغرفة المؤقتة')
                    .setColor(0x00AE86)
                    .addFields(
                        { name: '👤 المستخدم المختار', value: `<@${targetUser.id}>`, inline: true },
                        { name: '📅 مدة الغرفة', value: `${durationDays} أيام`, inline: true },
                        { name: '🌍 منشنات @everyone', value: `0/${everyoneMentions}`, inline: true },
                        { name: '📍 منشنات @here', value: `0/${hereMentions}`, inline: true }
              
