
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
                            deny: [PermissionFlagsBits.SendMessages],
                            allow: [PermissionFlagsBits.ViewChannel],
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
                    )
                    .setTimestamp();

                if (shopRole) {
                    embed.addFields(
                        { name: '🏪 رتبة المتجر', value: `<@&${shopRole.id}>`, inline: true },
                        { name: '🛒 منشنات المتجر', value: `0/${shopMentions}`, inline: true }
                    );
                }

                embed.addFields(
                    { name: '⚠️ تحذير', value: 'إذا تم تجاوز العدد المسموح من المنشنات، ستتم إزالة صلاحياتك أو حذف الغرفة!', inline: false }
                );

                const sentMessage = await channel.send({ embeds: [embed], components: [row] });

                const roomData = {
                    channelId: channel.id,
                    userId: targetUser.id,
                    everyoneMentions: everyoneMentions,
                    hereMentions: hereMentions,
                    shopRole: shopRole?.id || null,
                    shopMentions: shopMentions,
                    createdAt: Date.now(),
                    duration: durationDays * 24 * 60 * 60 * 1000,
                    creatorId: interaction.user.id,
                    messageId: sentMessage.id
                };

                tempRooms.set(channel.id, roomData);
                mentionCounts.set(`${channel.id}-${targetUser.id}`, {
                    everyone: 0,
                    here: 0,
                    shop: 0
                });

                setTimeout(async () => {
                    if (tempRooms.has(channel.id)) {
                        await channel.delete();
                        tempRooms.delete(channel.id);
                        mentionCounts.delete(`${channel.id}-${targetUser.id}`);
                    }
                }, roomData.duration);

                await interaction.reply({ content: `تم إنشاء الغرفة <#${channel.id}> بنجاح!`, ephemeral: true });

            } catch (error) {
                console.error('خطأ في إنشاء الغرفة:', error);
                await interaction.reply({ content: 'حدث خطأ أثناء إنشاء الغرفة!', ephemeral: true });
            }
        }
    }

    // التعامل مع أزرار التذاكر
    if (interaction.isButton()) {
        const guildId = interaction.guild.id;
        
        if (!ticketCounters.has(guildId)) {
            ticketCounters.set(guildId, { renewal: 0, mention: 0 });
        }

        if (interaction.customId === 'shop_renewal') {
            const counter = ticketCounters.get(guildId);
            counter.renewal++;
            
            const ticketChannel = await interaction.guild.channels.create({
                name: `تجديد-متجر-${counter.renewal}`,
                type: ChannelType.GuildText,
                permissionOverwrites: [
                    {
                        id: interaction.guild.roles.everyone,
                        deny: [PermissionFlagsBits.ViewChannel],
                    },
                    {
                        id: interaction.user.id,
                        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
                    },
                ],
            });

            const modal = new ModalBuilder()
                .setCustomId(`renewal_modal_${ticketChannel.id}`)
                .setTitle('تجديد المتجر');

            const daysInput = new TextInputBuilder()
                .setCustomId('days_input')
                .setLabel('كم يوم تريد تجديد المتجر؟')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('أدخل عدد الأيام')
                .setRequired(true);

            const firstActionRow = new ActionRowBuilder().addComponents(daysInput);
            modal.addComponents(firstActionRow);

            await interaction.showModal(modal);
        }

        if (interaction.customId === 'buy_mentions') {
            const counter = ticketCounters.get(guildId);
            counter.mention++;
            
            const ticketChannel = await interaction.guild.channels.create({
                name: `شراء-منشن-${counter.mention}`,
                type: ChannelType.GuildText,
                permissionOverwrites: [
                    {
                        id: interaction.guild.roles.everyone,
                        deny: [PermissionFlagsBits.ViewChannel],
                    },
                    {
                        id: interaction.user.id,
                        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
                    },
                ],
            });

            const copyButton = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`copy_mention_form_${ticketChannel.id}`)
                        .setLabel('نسخ النموذج')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('📋')
                );

            const embed = new EmbedBuilder()
                .setTitle('🛒 شراء منشنات')
                .setDescription('اضغط على الزر أدناه لنسخ النموذج وتعبئته')
                .setColor(0x00FF00);

            await ticketChannel.send({ embeds: [embed], components: [copyButton] });
            await interaction.reply({ content: `تم إنشاء تذكرة شراء منشن <#${ticketChannel.id}>`, ephemeral: true });
        }

        if (interaction.customId.startsWith('copy_mention_form_')) {
            const formText = `كم منشن تريد؟
يرجى تعبئتها
everyone: ؟
here: ؟
منشن متجر: ؟`;

            await interaction.reply({ content: `\`\`\`${formText}\`\`\``, ephemeral: true });
        }
    }

    // التعامل مع النماذج المودالية
    if (interaction.isModalSubmit()) {
        if (interaction.customId.startsWith('renewal_modal_')) {
            const channelId = interaction.customId.split('_')[2];
            const days = parseInt(interaction.fields.getTextInputValue('days_input'));
            const guildId = interaction.guild.id;
            
            const guildPricing = pricing.get(guildId);
            if (!guildPricing || !guildPricing.renewalPrices[days]) {
                return interaction.reply({ content: 'لم يتم تحديد سعر لهذا العدد من الأيام!', ephemeral: true });
            }

            const price = guildPricing.renewalPrices[days];
            const command = guildPricing.command;
            const paymentCommand = `${command} ${price} <@${interaction.user.id}>`;

            const embed = new EmbedBuilder()
                .setTitle('💰 أمر الدفع للتجديد')
                .setDescription(`لتجديد المتجر لمدة ${days} أيام، يرجى كتابة الأمر التالي:`)
                .addFields(
                    { name: '📝 الأمر', value: `\`${paymentCommand}\``, inline: false },
                    { name: '💵 المبلغ', value: `${price}`, inline: true },
                    { name: '📅 المدة', value: `${days} أيام`, inline: true }
                )
                .setColor(0xFFD700);

            const channel = await interaction.guild.channels.fetch(channelId);
            await channel.send({ embeds: [embed] });
            await interaction.reply({ content: 'تم إرسال أمر الدفع في التذكرة!', ephemeral: true });
        }
    }
});

client.on('messageCreate', async message => {
    if (message.author.bot) return;

    const channelId = message.channel.id;
    const roomData = tempRooms.get(channelId);

    if (!roomData) {
        // التحقق من رسائل الدفع في التذاكر
        if (message.channel.name.startsWith('تجديد-متجر-') || message.channel.name.startsWith('شراء-منشن-')) {
            // التحقق من النماذج المعبأة في تذاكر شراء المنشنات
            if (message.channel.name.startsWith('شراء-منشن-') && !message.content.includes('تحويل')) {
                const guildId = message.guild.id;
                const guildPricing = pricing.get(guildId);
                
                if (!guildPricing) {
                    return message.reply('لم يتم تحديد أسعار المنشنات بعد! يرجى مراجعة الإدارة.');
                }
                
                // محاولة تحليل النموذج المعبأ
                const lines = message.content.split('\n');
                let everyoneCount = 0;
                let hereCount = 0;
                let shopCount = 0;
                
                for (const line of lines) {
                    if (line.toLowerCase().includes('everyone:')) {
                        const match = line.match(/(\d+)/);
                        if (match) everyoneCount = parseInt(match[1]);
                    } else if (line.toLowerCase().includes('here:')) {
                        const match = line.match(/(\d+)/);
                        if (match) hereCount = parseInt(match[1]);
                    } else if (line.toLowerCase().includes('منشن متجر:') || line.toLowerCase().includes('متجر:')) {
                        const match = line.match(/(\d+)/);
                        if (match) shopCount = parseInt(match[1]);
                    }
                }
                
                // حساب السعر الإجمالي
                let totalPrice = 0;
                let priceBreakdown = '';
                
                if (everyoneCount > 0) {
                    const everyonePrice = everyoneCount * guildPricing.mentionPrices.everyone;
                    totalPrice += everyonePrice;
                    priceBreakdown += `• ${everyoneCount} منشن @everyone = ${everyonePrice}\n`;
                }
                
                if (hereCount > 0) {
                    const herePrice = hereCount * guildPricing.mentionPrices.here;
                    totalPrice += herePrice;
                    priceBreakdown += `• ${hereCount} منشن @here = ${herePrice}\n`;
                }
                
                if (shopCount > 0) {
                    const shopPrice = shopCount * guildPricing.mentionPrices.shop;
                    totalPrice += shopPrice;
                    priceBreakdown += `• ${shopCount} منشن متجر = ${shopPrice}\n`;
                }
                
                if (totalPrice > 0) {
                    const command = guildPricing.command;
                    const paymentCommand = `${command} ${totalPrice} <@${message.author.id}>`;
                    
                    const embed = new EmbedBuilder()
                        .setTitle('💰 أمر الدفع لشراء المنشنات')
                        .setDescription('تم حساب السعر الإجمالي للمنشنات المطلوبة:')
                        .addFields(
                            { name: '📋 تفاصيل الطلب', value: priceBreakdown, inline: false },
                            { name: '💵 المجموع الكلي', value: `${totalPrice}`, inline: true },
                            { name: '📝 الأمر', value: `\`${paymentCommand}\``, inline: false }
                        )
                        .setColor(0x00FF00);
                    
                    await message.reply({ embeds: [embed] });
                } else {
                    await message.reply('❌ لم يتم العثور على أرقام صحيحة في النموذج! يرجى التأكد من تعبئة النموذج بالشكل الصحيح.');
                }
                
                return;
            }
            
            // التحقق من وجود رسالة تحويل من ProBot
            const messages = await message.channel.messages.fetch({ limit: 10 });
            const probotMessage = messages.find(msg => 
                msg.author.username === 'ProBot✨' && 
                msg.content.includes('تحويل') && 
                msg.content.includes(message.content.match(/\d+/)?.[0])
            );

            if (probotMessage) {
                if (message.channel.name.startsWith('تجديد-متجر-')) {
                    await message.channel.send('✅ تم تأكيد الدفع! سيتم تجديد المتجر.');
                } else {
                    await message.channel.send('✅ تم تأكيد الدفع! سيتم إضافة المنشنات.');
                }
                
                setTimeout(async () => {
                    await message.channel.delete();
                }, 5000);
            }
        }
        return;
    }

    if (message.author.id !== roomData.userId) return;

    const mentionKey = `${channelId}-${message.author.id}`;
    const currentCounts = mentionCounts.get(mentionKey);

    if (!currentCounts) return;

    let violationOccurred = false;
    let removePermissions = false;

    if (message.content.includes('@everyone')) {
        currentCounts.everyone++;
        if (currentCounts.everyone > roomData.everyoneMentions) {
            violationOccurred = true;
        }

        const remainingEveryone = Math.max(0, roomData.everyoneMentions - currentCounts.everyone);
        await message.reply(`📊 تم استخدام منشن @everyone\nالمتبقي: ${remainingEveryone}/${roomData.everyoneMentions}`);
    }

    if (message.content.includes('@here')) {
        currentCounts.here++;
        if (currentCounts.here > roomData.hereMentions) {
            violationOccurred = true;
        }

        const remainingHere = Math.max(0, roomData.hereMentions - currentCounts.here);
        await message.reply(`📊 تم استخدام منشن @here\nالمتبقي: ${remainingHere}/${roomData.hereMentions}`);
    }

    if (roomData.shopRole && message.mentions.roles.has(roomData.shopRole)) {
        currentCounts.shop++;
        if (currentCounts.shop > roomData.shopMentions) {
            violationOccurred = true;
        }

        const remainingShop = Math.max(0, roomData.shopMentions - currentCounts.shop);
        await message.reply(`📊 تم استخدام منشن المتجر\nالمتبقي: ${remainingShop}/${roomData.shopMentions}`);
    }

    if (currentCounts.everyone >= roomData.everyoneMentions &&
        currentCounts.here >= roomData.hereMentions &&
        currentCounts.shop >= roomData.shopMentions) {
        removePermissions = true;
    }

    mentionCounts.set(mentionKey, currentCounts);

    if (violationOccurred) {
        await message.channel.send('❌ تم تجاوز العدد المسموح من المنشنات! سيتم حذف الغرفة...');
        setTimeout(async () => {
            if (tempRooms.has(channelId)) {
                await message.channel.delete();
                tempRooms.delete(channelId);
                mentionCounts.delete(mentionKey);
            }
        }, 3000);
    } else if (removePermissions) {
        try {
            await message.channel.permissionOverwrites.edit(message.author.id, {
                MentionEveryone: false
            });
            await message.channel.send('⚠️ لقد استنفدت جميع المنشنات المسموحة! تم إزالة صلاحية المنشن.');
        } catch (error) {
            console.error('خطأ في إزالة الصلاحيات:', error);
        }
    } else {
        const embed = new EmbedBuilder()
            .setTitle('🏠 تم إنشاء الغرفة المؤقتة')
            .setColor(0x00AE86)
            .addFields(
                { name: '👤 المستخدم المختار', value: `<@${roomData.userId}>`, inline: true },
                { name: '📅 الوقت المتبقي', value: `${Math.ceil((roomData.duration - (Date.now() - roomData.createdAt)) / (24 * 60 * 60 * 1000))} أيام`, inline: true },
                { name: '🌍 منشنات @everyone', value: `${currentCounts.everyone}/${roomData.everyoneMentions}`, inline: true },
                { name: '📍 منشنات @here', value: `${currentCounts.here}/${roomData.hereMentions}`, inline: true }
            );

        if (roomData.shopRole) {
            embed.addFields(
                { name: '🏪 رتبة المتجر', value: `<@&${roomData.shopRole}>`, inline: true },
                { name: '🛒 منشنات المتجر', value: `${currentCounts.shop}/${roomData.shopMentions}`, inline: true }
            );
        }

        embed.addFields(
            { name: '⚠️ تحذير', value: 'إذا تم تجاوز العدد المسموح من المنشنات، ستتم إزالة صلاحياتك أو حذف الغرفة!', inline: false }
        );

        embed.setTimestamp();

        // إضافة الأزرار للرسالة المحدثة
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

        try {
            const originalMessage = await message.channel.messages.fetch(roomData.messageId);
            await originalMessage.edit({ embeds: [embed], components: [row] });
        } catch (error) {
            console.error('خطأ في تحديث الإيمبد:', error);
        }
    }
});

client.on('error', console.error);

if (!process.env.DISCORD_BOT_TOKEN) {
    console.error('يرجى إضافة DISCORD_BOT_TOKEN في Secrets!');
    process.exit(1);
}

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('🤖 Discord Bot is running!\nبوت ديسكورد يعمل بنجاح!');
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`HTTP Server is running on port ${PORT}`);
});

client.login(process.env.DISCORD_BOT_TOKEN);
