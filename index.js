
const { Client, GatewayIntentBits, SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ChannelType, REST, Routes } = require('discord.js');

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
const allowedUsers = new Map(); // تخزين المستخدمين المسموح لهم باستخدام الأمر

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
        .setName('set-permissions')
        .setDescription('تحديد من يمكنه استخدام أمر إنشاء الغرف')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('المستخدم المسموح له')
                .setRequired(false))
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('الرتبة المسموح لها')
                .setRequired(false))
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
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    if (commandName === 'set-permissions') {
        // التحقق من أن المستخدم لديه صلاحية إدارة الخادم
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

    if (commandName === 'create-room') {
        // التحقق من الصلاحيات
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
            // إنشاء الغرفة
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

            // حفظ معلومات الغرفة
            const roomData = {
                channelId: channel.id,
                userId: targetUser.id,
                everyoneMentions: everyoneMentions,
                hereMentions: hereMentions,
                shopRole: shopRole?.id || null,
                shopMentions: shopMentions,
                createdAt: Date.now(),
                duration: durationDays * 24 * 60 * 60 * 1000, // تحويل إلى ميلي ثانية
                creatorId: interaction.user.id
            };

            tempRooms.set(channel.id, roomData);
            mentionCounts.set(`${channel.id}-${targetUser.id}`, {
                everyone: 0,
                here: 0,
                shop: 0
            });

            // إنشاء رسالة الإيمبد
            const embed = new EmbedBuilder()
                .setTitle('🏠 تم إنشاء الغرفة المؤقتة')
                .setColor(0x00AE86)
                .addFields(
                    { name: '👤 المستخدم المختار', value: `<@${targetUser.id}>`, inline: true },
                    { name: '📅 مدة الغرفة', value: `${durationDays} أيام`, inline: true },
                    { name: '🌍 منشنات @everyone', value: `${everyoneMentions}`, inline: true },
                    { name: '📍 منشنات @here', value: `${hereMentions}`, inline: true }
                )
                .setTimestamp();

            if (shopRole) {
                embed.addFields(
                    { name: '🏪 رتبة المتجر', value: `<@&${shopRole.id}>`, inline: true },
                    { name: '🛒 منشنات المتجر', value: `${shopMentions}`, inline: true }
                );
            }

            embed.addFields(
                { name: '⚠️ تحذير', value: 'إذا تم تجاوز العدد المسموح من المنشنات، ستتم إزالة صلاحياتك أو حذف الغرفة!', inline: false }
            );

            await channel.send({ embeds: [embed] });

            // جدولة حذف الغرفة
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
});

client.on('messageCreate', async message => {
    if (message.author.bot) return;

    const channelId = message.channel.id;
    const roomData = tempRooms.get(channelId);
    
    if (!roomData) return;

    // التحقق من أن المرسل هو المستخدم المخول
    if (message.author.id !== roomData.userId) return;

    const mentionKey = `${channelId}-${message.author.id}`;
    const currentCounts = mentionCounts.get(mentionKey);

    if (!currentCounts) return;

    let violationOccurred = false;
    let removePermissions = false;

    // التحقق من منشنات @everyone
    if (message.content.includes('@everyone')) {
        currentCounts.everyone++;
        if (currentCounts.everyone > roomData.everyoneMentions) {
            violationOccurred = true;
        }
    }

    // التحقق من منشنات @here
    if (message.content.includes('@here')) {
        currentCounts.here++;
        if (currentCounts.here > roomData.hereMentions) {
            violationOccurred = true;
        }
    }

    // التحقق من منشنات المتجر
    if (roomData.shopRole && message.mentions.roles.has(roomData.shopRole)) {
        currentCounts.shop++;
        if (currentCounts.shop > roomData.shopMentions) {
            violationOccurred = true;
        }
    }

    // التحقق من استنفاد جميع المنشنات المسموحة
    if (currentCounts.everyone >= roomData.everyoneMentions && 
        currentCounts.here >= roomData.hereMentions && 
        currentCounts.shop >= roomData.shopMentions) {
        removePermissions = true;
    }

    // تحديث العدادات
    mentionCounts.set(mentionKey, currentCounts);

    if (violationOccurred) {
        // حذف الغرفة عند المخالفة
        await message.channel.send('❌ تم تجاوز العدد المسموح من المنشنات! سيتم حذف الغرفة...');
        setTimeout(async () => {
            await message.channel.delete();
            tempRooms.delete(channelId);
            mentionCounts.delete(mentionKey);
        }, 3000);
    } else if (removePermissions) {
        // إزالة صلاحيات المنشن عند استنفاد جميع المنشنات
        try {
            await message.channel.permissionOverwrites.edit(message.author.id, {
                MentionEveryone: false
            });
            await message.channel.send('⚠️ لقد استنفدت جميع المنشنات المسموحة! تم إزالة صلاحية المنشن.');
        } catch (error) {
            console.error('خطأ في إزالة الصلاحيات:', error);
        }
    }
});

// التعامل مع الأخطاء
client.on('error', console.error);

// تسجيل الدخول
if (!process.env.DISCORD_BOT_TOKEN) {
    console.error('يرجى إضافة DISCORD_BOT_TOKEN في Secrets!');
    process.exit(1);
}

client.login(process.env.DISCORD_BOT_TOKEN);
