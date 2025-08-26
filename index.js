const { Client, GatewayIntentBits, SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ChannelType, REST, Routes, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder } = require('discord.js');
const http = require('http');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// توكن البوت - يجب إضافته في الـ Secrets
const TOKEN = process.env.DISCORD_TOKEN || process.env.DISCORD_BOT_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

// نظام تخزين البيانات
class DataStorage {
    constructor() {
        this.data = {
            serverSettings: new Map(),
            maintenanceMode: new Map(),
            channelPermissions: new Map(),
            tempRooms: new Map(),
            allowedUsers: new Map(),
            pricing: new Map(),
            mentionCounts: new Map(),
            ticketCounters: new Map(),
            renewalTickets: new Map(),
            mentionTickets: new Map(),
            embedsData: new Map(),
            ticketEmbedCounters: new Map()
        };
        this.storageFile = 'bot_data.json';
    }

    // حفظ البيانات
    async saveData() {
        try {
            const dataToSave = {
                serverSettings: Object.fromEntries(this.data.serverSettings),
                maintenanceMode: Object.fromEntries(this.data.maintenanceMode),
                channelPermissions: Object.fromEntries(this.data.channelPermissions),
                tempRooms: Object.fromEntries(this.data.tempRooms),
                allowedUsers: Object.fromEntries(this.data.allowedUsers),
                pricing: Object.fromEntries(this.data.pricing),
                mentionCounts: Object.fromEntries(this.data.mentionCounts),
                ticketCounters: Object.fromEntries(this.data.ticketCounters),
                renewalTickets: Object.fromEntries(this.data.renewalTickets),
                mentionTickets: Object.fromEntries(this.data.mentionTickets),
                embedsData: Object.fromEntries(this.data.embedsData),
                ticketEmbedCounters: Object.fromEntries(this.data.ticketEmbedCounters)
            };

            // استخدام File System كبديل بسيط
            const fs = require('fs').promises;
            await fs.writeFile(this.storageFile, JSON.stringify(dataToSave, null, 2));
            console.log('تم حفظ البيانات بنجاح');
        } catch (error) {
            console.error('خطأ في حفظ البيانات:', error);
        }
    }

    // تحميل البيانات
    async loadData() {
        try {
            const fs = require('fs').promises;
            const fileContent = await fs.readFile(this.storageFile, 'utf8');
            const savedData = JSON.parse(fileContent);

            this.data.serverSettings = new Map(Object.entries(savedData.serverSettings || {}));
            this.data.maintenanceMode = new Map(Object.entries(savedData.maintenanceMode || {}));
            this.data.channelPermissions = new Map(Object.entries(savedData.channelPermissions || {}));
            this.data.tempRooms = new Map(Object.entries(savedData.tempRooms || {}));
            this.data.allowedUsers = new Map(Object.entries(savedData.allowedUsers || {}));
            this.data.pricing = new Map(Object.entries(savedData.pricing || {}));
            this.data.mentionCounts = new Map(Object.entries(savedData.mentionCounts || {}));
            this.data.ticketCounters = new Map(Object.entries(savedData.ticketCounters || {}));
            this.data.renewalTickets = new Map(Object.entries(savedData.renewalTickets || {}));
            this.data.mentionTickets = new Map(Object.entries(savedData.mentionTickets || {}));
            this.data.embedsData = new Map(Object.entries(savedData.embedsData || {}));
            this.data.ticketEmbedCounters = new Map(Object.entries(savedData.ticketEmbedCounters || {}));

            console.log('تم تحميل البيانات بنجاح');
        } catch (error) {
            console.log('لم يتم العثور على ملف البيانات، سيتم إنشاء واحد جديد');
        }
    }

    // حفظ تلقائي كل 5 دقائق
    startAutoSave() {
        setInterval(() => {
            this.saveData();
        }, 5 * 60 * 1000); // 5 دقائق
    }
}

// إنشاء مثيل التخزين
const storage = new DataStorage();

// دالة إنشاء تكت من الإيمبد
async function createTicketFromEmbed(interaction, embedId, buttonIndex) {
    const guildId = interaction.guild.id;
    const embedsArray = storage.data.embedsData.get(guildId) || [];

    if (embedId >= embedsArray.length) {
        return interaction.reply({ content: '❌ الإيمبد غير موجود!', ephemeral: true });
    }

    const embedData = embedsArray[embedId];
    const category = await interaction.guild.channels.fetch(embedData.categoryId).catch(() => null);
    const staffRole = await interaction.guild.roles.fetch(embedData.staffRoleId).catch(() => null);

    if (!category || !staffRole) {
        return interaction.reply({ content: '❌ الكاتيجوري أو رتبة الموظفين غير موجودة!', ephemeral: true });
    }

    // زيادة عداد التكتات
    const counters = storage.data.ticketEmbedCounters.get(guildId) || {};
    if (!counters[embedId]) counters[embedId] = 0;
    counters[embedId]++;
    storage.data.ticketEmbedCounters.set(guildId, counters);

    try {
        // إنشاء قناة التكت
        const ticketChannel = await interaction.guild.channels.create({
            name: `ticket-${counters[embedId]}`,
            type: ChannelType.GuildText,
            parent: category.id,
            topic: `تكت مفتوح بواسطة ${interaction.user.username} (${interaction.user.id}) - ${embedData.buttonTexts[buttonIndex]}`,
            permissionOverwrites: [
                {
                    id: interaction.guild.id,
                    deny: [PermissionFlagsBits.ViewChannel]
                },
                {
                    id: interaction.user.id,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
                    deny: [PermissionFlagsBits.CreatePublicThreads, PermissionFlagsBits.CreatePrivateThreads]
                },
                {
                    id: staffRole.id,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
                    deny: [PermissionFlagsBits.CreatePublicThreads, PermissionFlagsBits.CreatePrivateThreads]
                }
            ]
        });

        // إرسال رسالة ترحيب
        const welcomeEmbed = new EmbedBuilder()
            .setTitle('🎫 تم إنشاء التكت بنجاح')
            .setDescription(`مرحباً ${interaction.user}!\n\nتم إنشاء التكت الخاص بك: **${embedData.buttonTexts[buttonIndex]}**\n\nسيقوم الموظفون بالرد عليك قريباً.`)
            .setColor(0x00FF00)
            .setTimestamp();

        const controlButtons = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('claim_ticket')
                    .setLabel('استلام التكت')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('✋'),
                new ButtonBuilder()
                    .setCustomId('close_ticket')
                    .setLabel('إغلاق التكت')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('🔒')
            );

        await ticketChannel.send({ 
            content: `${staffRole}`, 
            embeds: [welcomeEmbed], 
            components: [controlButtons] 
        });

        await interaction.reply({ 
            content: `✅ تم إنشاء التكت الخاص بك: ${ticketChannel}`, 
            ephemeral: true 
        });

    } catch (error) {
        console.error('خطأ في إنشاء التكت:', error);
        await interaction.reply({ 
            content: '❌ حدث خطأ أثناء إنشاء التكت!', 
            ephemeral: true 
        });
    }
}

// الأوامر
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
        .addUserOption(option =>
            option.setName('مستلم-الرصيد')
                .setDescription('الشخص الذي سيتم إرسال له الرصيد')
                .setRequired(false)),

    new SlashCommandBuilder()
        .setName('تفعيل-وضع-الصيانة')
        .setDescription('تفعيل وضع الصيانة - إخفاء جميع الغرف عن الجميع')
        .addBooleanOption(option =>
            option.setName('تأكيد')
                .setDescription('هل أنت متأكد من تفعيل وضع الصيانة؟')
                .setRequired(true)),

    new SlashCommandBuilder()
        .setName('اطفاء-وضع-الصيانة')
        .setDescription('إطفاء وضع الصيانة - إعادة الغرف كما كانت سابقاً')
        .addBooleanOption(option =>
            option.setName('تأكيد')
                .setDescription('هل أنت متأكد من إطفاء وضع الصيانة؟')
                .setRequired(true)),

    new SlashCommandBuilder()
        .setName('حالة-البيانات')
        .setDescription('عرض حالة البيانات المحفوظة'),

    new SlashCommandBuilder()
        .setName('حفظ-البيانات')
        .setDescription('حفظ البيانات يدوياً'),

    new SlashCommandBuilder()
        .setName('حذف-غرف-متعددة')
        .setDescription('حذف عدة غرف مختارة في آن واحد')
        .addChannelOption(option =>
            option.setName('غرفة-1')
                .setDescription('اختر الغرفة الأولى للحذف')
                .setRequired(false))
        .addChannelOption(option =>
            option.setName('غرفة-2')
                .setDescription('اختر الغرفة الثانية للحذف')
                .setRequired(false))
        .addChannelOption(option =>
            option.setName('غرفة-3')
                .setDescription('اختر الغرفة الثالثة للحذف')
                .setRequired(false))
        .addChannelOption(option =>
            option.setName('غرفة-4')
                .setDescription('اختر الغرفة الرابعة للحذف')
                .setRequired(false))
        .addChannelOption(option =>
            option.setName('غرفة-5')
                .setDescription('اختر الغرفة الخامسة للحذف')
                .setRequired(false))
        .addChannelOption(option =>
            option.setName('غرفة-6')
                .setDescription('اختر الغرفة السادسة للحذف')
                .setRequired(false))
        .addChannelOption(option =>
            option.setName('غرفة-7')
                .setDescription('اختر الغرفة السابعة للحذف')
                .setRequired(false))
        .addChannelOption(option =>
            option.setName('غرفة-8')
                .setDescription('اختر الغرفة الثامنة للحذف')
                .setRequired(false))
        .addChannelOption(option =>
            option.setName('غرفة-9')
                .setDescription('اختر الغرفة التاسعة للحذف')
                .setRequired(false))
        .addChannelOption(option =>
            option.setName('غرفة-10')
                .setDescription('اختر الغرفة العاشرة للحذف')
                .setRequired(false)),

    new SlashCommandBuilder()
        .setName('send_message')
        .setDescription('إرسال رسالة خاصة لمستخدم محدد')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('المستخدم الذي ستُرسل له الرسالة')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('message')
                .setDescription('محتوى الرسالة')
                .setRequired(true))
        .addBooleanOption(option =>
            option.setName('mention')
                .setDescription('هل تريد عمل منشن للمستخدم في الرسالة؟')
                .setRequired(false)),

    new SlashCommandBuilder()
        .setName('send_to_multiple')
        .setDescription('إرسال رسالة خاصة لعدد محدد من الأعضاء بشكل عشوائي')
        .addIntegerOption(option =>
            option.setName('count')
                .setDescription('عدد الأعضاء الذين سترسل لهم الرسالة')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('message')
                .setDescription('محتوى الرسالة')
                .setRequired(true))
        .addBooleanOption(option =>
            option.setName('mention')
                .setDescription('هل تريد عمل منشن للمستخدم في الرسالة؟')
                .setRequired(false)),

    new SlashCommandBuilder()
        .setName('قفل-الروم')
        .setDescription('قفل غرفة معينة أو الغرفة الحالية')
        .addChannelOption(option =>
            option.setName('الغرفة')
                .setDescription('الغرفة التي تريد قفلها (اختياري)')
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('كتابي')
                .setDescription('هل تريد تفعيل الأمر الكتابي "قفل"؟')
                .setRequired(false)),

    new SlashCommandBuilder()
        .setName('فتح-الروم')
        .setDescription('فتح غرفة معينة أو الغرفة الحالية')
        .addChannelOption(option =>
            option.setName('الغرفة')
                .setDescription('الغرفة التي تريد فتحها (اختياري)')
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('كتابي')
                .setDescription('هل تريد تفعيل الأمر الكتابي "فتح"؟')
                .setRequired(false)),

    new SlashCommandBuilder()
        .setName('مسح-الرسائل')
        .setDescription('مسح عدد معين من الرسائل في الغرفة الحالية')
        .addIntegerOption(option =>
            option.setName('العدد')
                .setDescription('عدد الرسائل المراد مسحها')
                .setRequired(true))
        .addBooleanOption(option =>
            option.setName('كتابي')
                .setDescription('هل تريد تفعيل الأمر الكتابي "مسح"؟')
                .setRequired(false)),

    new SlashCommandBuilder()
        .setName('حظر-المستخدم')
        .setDescription('حظر مستخدم من السيرفر')
        .addUserOption(option =>
            option.setName('المستخدم')
                .setDescription('المستخدم الذي تريد حظره')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('السبب')
                .setDescription('سبب الحظر (اختياري)')
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('كتابي')
                .setDescription('هل تريد تفعيل الأمر الكتابي "حظر"؟')
                .setRequired(false)),

    new SlashCommandBuilder()
        .setName('طرد-المستخدم')
        .setDescription('طرد مستخدم من السيرفر')
        .addUserOption(option =>
            option.setName('المستخدم')
                .setDescription('المستخدم الذي تريد طرده')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('السبب')
                .setDescription('سبب الطرد (اختياري)')
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('كتابي')
                .setDescription('هل تريد تفعيل الأمر الكتابي "طرد"؟')
                .setRequired(false)),

    new SlashCommandBuilder()
        .setName('اعطاء-رتبة')
        .setDescription('إعطاء رتبة لمستخدم')
        .addUserOption(option =>
            option.setName('المستخدم')
                .setDescription('المستخدم الذي تريد إعطائه الرتبة')
                .setRequired(true))
        .addRoleOption(option =>
            option.setName('الرتبة')
                .setDescription('الرتبة التي تريد إعطاءها')
                .setRequired(true))
        .addBooleanOption(option =>
            option.setName('كتابي')
                .setDescription('هل تريد تفعيل الأمر الكتابي "اعطاء"؟')
                .setRequired(false)),

    new SlashCommandBuilder()
        .setName('سحب-رتبة')
        .setDescription('سحب رتبة من مستخدم')
        .addUserOption(option =>
            option.setName('المستخدم')
                .setDescription('المستخدم الذي تريد سحب الرتبة منه')
                .setRequired(true))
        .addRoleOption(option =>
            option.setName('الرتبة')
                .setDescription('الرتبة التي تريد سحبها')
                .setRequired(true))
        .addBooleanOption(option =>
            option.setName('كتابي')
                .setDescription('هل تريد تفعيل الأمر الكتابي "سحب"؟')
                .setRequired(false)),

    new SlashCommandBuilder()
        .setName('تغيير-اسم-الروم')
        .setDescription('تغيير اسم غرفة معينة أو الغرفة الحالية')
        .addStringOption(option =>
            option.setName('الاسم-الجديد')
                .setDescription('الاسم الجديد للغرفة')
                .setRequired(true))
        .addChannelOption(option =>
            option.setName('الغرفة')
                .setDescription('الغرفة التي تريد تغيير اسمها (اختياري)')
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('كتابي')
                .setDescription('هل تريد تفعيل الأمر الكتابي "تغيير-اسم"؟')
                .setRequired(false)),

    new SlashCommandBuilder()
        .setName('تغيير-جميع-الرومات')
        .setDescription('تغيير اسم جميع الغرف النصية في السيرفر')
        .addStringOption(option =>
            option.setName('الاسم-الجديد')
                .setDescription('الاسم الجديد لجميع الغرف')
                .setRequired(true)),

    new SlashCommandBuilder()
        .setName('ارسال-ايمبد')
        .setDescription('إرسال إيمبد مع أزرار أو شريط اختيار')
        .addStringOption(option =>
            option.setName('عنوان-الايمبد')
                .setDescription('عنوان الإيمبد')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('محتوى-الايمبد')
                .setDescription('محتوى الإيمبد')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('نوع-التفاعل')
                .setDescription('نوع التفاعل')
                .setRequired(true)
                .addChoices(
                    { name: 'زر واحد', value: 'single_button' },
                    { name: 'أزرار متعددة', value: 'multiple_buttons' },
                    { name: 'شريط اختيار', value: 'select_menu' }
                ))
        .addStringOption(option =>
            option.setName('نص-الزر-الاول')
                .setDescription('نص الزر الأول (مطلوب لجميع الأنواع)')
                .setRequired(true))
        .addChannelOption(option =>
            option.setName('كاتيجوري-التكتات')
                .setDescription('الكاتيجوري التي ستُفتح فيه التكتات')
                .setRequired(true))
        .addRoleOption(option =>
            option.setName('رتبة-الموظفين')
                .setDescription('رتبة الموظفين الذين يمكنهم رؤية التكتات')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('رسالة-فوق-الايمبد')
                .setDescription('الرسالة التي ستظهر فوق الإيمبد')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('نص-الزر-الثاني')
                .setDescription('نص الزر الثاني (للأزرار المتعددة والشريط)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('نص-الزر-الثالث')
                .setDescription('نص الزر الثالث (للأزرار المتعددة والشريط)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('نص-الزر-الرابع')
                .setDescription('نص الزر الرابع (للأزرار المتعددة والشريط)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('نص-الزر-الخامس')
                .setDescription('نص الزر الخامس (للأزرار المتعددة والشريط)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('لون-الايمبد')
                .setDescription('لون الإيمبد (hex code مثل #FF0000)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('صورة-الايمبد')
                .setDescription('رابط صورة الإيمبد')
                .setRequired(false)),

    new SlashCommandBuilder()
        .setName('ادارة-الايمبدات')
        .setDescription('إدارة الإيمبدات وإعداداتها')
        .addStringOption(option =>
            option.setName('العملية')
                .setDescription('العملية المطلوبة')
                .setRequired(true)
                .addChoices(
                    { name: 'عرض جميع الإيمبدات', value: 'list_all' },
                    { name: 'حذف إيمبد', value: 'delete_embed' },
                    { name: 'تعديل كاتيجوري', value: 'edit_category' }
                ))
        .addIntegerOption(option =>
            option.setName('رقم-الايمبد')
                .setDescription('رقم الإيمبد للتعديل أو الحذف')
                .setRequired(false))
        .addChannelOption(option =>
            option.setName('كاتيجوري-جديد')
                .setDescription('الكاتيجوري الجديد (للتعديل)')
                .setRequired(false)),
];

// تسجيل الأوامر
async function registerCommands() {
    try {
        console.log('جاري تسجيل الأوامر...');

        const rest = new REST().setToken(TOKEN);

        await rest.put(
            Routes.applicationCommands(CLIENT_ID),
            { body: commands }
        );

        console.log('تم تسجيل الأوامر بنجاح!');
    } catch (error) {
        console.error('خطأ في تسجيل الأوامر:', error);
    }
}

// دالة لحفظ إعدادات السيرفر
function saveServerSettings(guildId, settings) {
    storage.data.serverSettings.set(guildId, { 
        ...storage.data.serverSettings.get(guildId), 
        ...settings 
    });
    storage.saveData(); // حفظ فوري
}

// دالة لجلب إعدادات السيرفر
function getServerSettings(guildId) {
    return storage.data.serverSettings.get(guildId) || {};
}

// Helper to save text command settings
function saveTextCommandSettings(guildId, commandName, enabled) {
    if (!storage.data.serverSettings.has(guildId)) {
        storage.data.serverSettings.set(guildId, {});
    }
    const settings = storage.data.serverSettings.get(guildId);
    settings[`textCommand_${commandName}`] = enabled;
    storage.saveData();
}

// عند جاهزية البوت
client.once('ready', async () => {
    console.log(`تم تشغيل البوت بنجاح! مسجل باسم ${client.user.tag}`);

    // تحميل البيانات المحفوظة
    await storage.loadData();

    // تنظيف البيانات المؤقتة للحذف المتعدد
    storage.data.tempChannelDelete = new Map();
    storage.data.tempSimpleDelete = new Map(); // Added for new delete command

    // بدء الحفظ التلقائي
    storage.startAutoSave();

    registerCommands();

    // إعداد حالة البوت
    client.user.setPresence({
        activities: [{
            name: 'نظام الغرف المؤقتة',
            type: 3
        }],
        status: 'online'
    });

    console.log('تم تحميل البيانات المحفوظة بنجاح');
});

// معالجة الرسائل
client.on('messageCreate', async message => {
    if (message.author.bot) return;

    // معالجة الغرف المؤقتة
    const channelId = message.channel.id;
    const roomData = storage.data.tempRooms.get(channelId);

    if (roomData && message.author.id === roomData.userId) {
        const mentionKey = `${channelId}-${message.author.id}`;
        const currentCounts = storage.data.mentionCounts.get(mentionKey);

        if (currentCounts) {
            let violationOccurred = false;
            let removePermissions = false;
            let shouldUpdateEmbed = false;

            if (message.content.includes('@everyone')) {
                currentCounts.everyone++;
                shouldUpdateEmbed = true;
                if (currentCounts.everyone > roomData.everyoneMentions) {
                    violationOccurred = true;
                }
            }

            if (message.content.includes('@here')) {
                currentCounts.here++;
                shouldUpdateEmbed = true;
                if (currentCounts.here > roomData.hereMentions) {
                    violationOccurred = true;
                }
            }

            if (roomData.shopRole && message.mentions.roles.has(roomData.shopRole)) {
                currentCounts.shop++;
                shouldUpdateEmbed = true;
                if (currentCounts.shop > roomData.shopMentions) {
                    violationOccurred = true;
                }
            }

            if (currentCounts.everyone >= roomData.everyoneMentions &&
                currentCounts.here >= roomData.hereMentions &&
                currentCounts.shop >= roomData.shopMentions) {
                removePermissions = true;
            }

            storage.data.mentionCounts.set(mentionKey, currentCounts);

            // تحديث الـ embed إذا تم استخدام منشن
            if (shouldUpdateEmbed) {
                try {
                    const targetUser = await client.users.fetch(roomData.userId);
                    const remainingEveryone = Math.max(0, roomData.everyoneMentions - currentCounts.everyone);
                    const remainingHere = Math.max(0, roomData.hereMentions - currentCounts.here);
                    const remainingShop = Math.max(0, roomData.shopMentions - currentCounts.shop);

                    const embed = new EmbedBuilder()
                        .setTitle('🏠 الغرفة المؤقتة')
                        .setColor(0x00AE86)
                        .addFields(
                            { name: '👤 المستخدم المختار', value: `<@${targetUser.id}>`, inline: true },
                            { name: '🌍 منشنات @everyone', value: `${currentCounts.everyone}/${roomData.everyoneMentions}`, inline: true },
                            { name: '📍 منشنات @here', value: `${currentCounts.here}/${roomData.hereMentions}`, inline: true }
                        )
                        .setTimestamp();

                    if (roomData.shopRole) {
                        embed.addFields(
                            { name: '🏪 رتبة المتجر', value: `<@&${roomData.shopRole}>`, inline: true },
                            { name: '🛒 منشنات المتجر', value: `${currentCounts.shop}/${roomData.shopMentions}`, inline: true }
                        );
                    }

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

                    const originalMessage = await message.channel.messages.fetch(roomData.messageId);
                    await originalMessage.edit({ embeds: [embed], components: [row] });
                } catch (error) {
                    console.error('خطأ في تحديث الإيمبد:', error);
                }
            }

            if (violationOccurred) {
                await message.channel.send('❌ تم تجاوز العدد المسموح من المنشنات! سيتم حذف الغرفة...');
                setTimeout(async () => {
                    if (storage.data.tempRooms.has(channelId)) {
                        await message.channel.delete();
                        storage.data.tempRooms.delete(channelId);
                        storage.data.mentionCounts.delete(mentionKey);
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
            }
        }
    }

    // معالجة تكتات التجديد والمنشنات
    if (!roomData) {
        if (message.channel.name.startsWith('تجديد-متجر-')) {
            // تحقق من كتابة أمر الدفع (c أو C مع الشخص والرقم)
            const paymentPattern = /^[Cc]\s+<@!?\d+>\s+\d+$/;
            if (paymentPattern.test(message.content.trim())) {
                // انتظار رسالة ProBot لمدة 40 ثانية
                setTimeout(async () => {
                    const messages = await message.channel.messages.fetch({ limit: 20 });
                    const amountMatch = message.content.match(/\d+$/);
                    const requiredAmount = amountMatch ? amountMatch[0] : null;

                    // البحث عن رسالة ProBot التي تحتوي على "قام بتحويل" والرقم المطلوب
                    const probotMessage = messages.find(msg => 
                        msg.author.username === 'ProBot✨' && 
                        msg.content.includes('قام بتحويل') && 
                        requiredAmount && msg.content.includes(requiredAmount)
                    );

                    if (probotMessage) {
                        await message.channel.send('✅ تم تأكيد الدفع! تم تجديد المتجر بنجاح.');
                        
                        // البحث عن الغرفة الأصلية وتجديدها
                        const ticketInfo = storage.data.renewalTickets?.get(message.channel.id);
                        if (ticketInfo) {
                            const originalChannel = await client.channels.fetch(ticketInfo.originalChannelId).catch(() => null);
                            const roomData = storage.data.tempRooms.get(ticketInfo.originalChannelId);
                            
                            if (originalChannel && roomData) {
                                // تجديد المتجر (يمكن إضافة منطق التجديد هنا)
                                await originalChannel.send(`✅ تم تجديد المتجر بنجاح من قبل <@${message.author.id}>!`);
                            }
                            
                            storage.data.renewalTickets.delete(message.channel.id);
                        }

                        setTimeout(async () => {
                            await message.channel.delete();
                        }, 3000);
                    } else {
                        // إذا لم يتم العثور على رسالة ProBot، إغلاق التكت
                        await message.channel.send('❌ لم يتم العثور على تأكيد الدفع من ProBot. سيتم إغلاق التكت.');
                        
                        // تنظيف بيانات التكت
                        storage.data.renewalTickets?.delete(message.channel.id);
                        
                        setTimeout(async () => {
                            await message.channel.delete();
                        }, 5000);
                    }
                }, 40000); // انتظار 40 ثانية
            }
            return;
        }

        if (message.channel.name.startsWith('شراء-منشن-')) {
            // معالجة النموذج المعبأ لحساب السعر
            if (!message.content.includes('تحويل') && !message.content.startsWith('C') && !message.content.startsWith('c')) {
                const guildId = message.guild.id;
                const guildPricing = storage.data.pricing.get(guildId);

                if (!guildPricing) {
                    return message.reply('لم يتم تحديد أسعار المنشنات بعد! يرجى مراجعة الإدارة.');
                }

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
                    const creditReceiverId = guildPricing.creditReceiver;

                    let paymentCommand = `${command} `;
                    if (creditReceiverId) {
                        paymentCommand += `<@${creditReceiverId}> ${totalPrice}`;
                    } else {
                        paymentCommand += `<@${message.author.id}> ${totalPrice}`;
                    }

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

            // تحقق من كتابة أمر الدفع لشراء المنشنات (c أو C مع الشخص والرقم)
            const paymentPattern = /^[Cc]\s+<@!?\d+>\s+\d+$/;
            if (paymentPattern.test(message.content.trim())) {
                // انتظار رسالة ProBot لمدة 40 ثانية
                setTimeout(async () => {
                    const messages = await message.channel.messages.fetch({ limit: 20 });
                    const amountMatch = message.content.match(/\d+$/);
                    const requiredAmount = amountMatch ? amountMatch[0] : null;

                    // البحث عن رسالة ProBot التي تحتوي على "قام بتحويل" والرقم المطلوب
                    const probotMessage = messages.find(msg => 
                        msg.author.username === 'ProBot✨' && 
                        msg.content.includes('قام بتحويل') && 
                        requiredAmount && msg.content.includes(requiredAmount)
                    );

                    if (probotMessage) {
                        await message.channel.send('✅ تم تأكيد الدفع! سيتم إضافة المنشنات.');
                        
                        // البحث عن الغرفة الأصلية وإضافة المنشنات
                        const ticketInfo = storage.data.mentionTickets?.get(message.channel.id);
                        if (ticketInfo) {
                            const originalChannel = await client.channels.fetch(ticketInfo.originalChannelId).catch(() => null);
                            const roomData = storage.data.tempRooms.get(ticketInfo.originalChannelId);
                            
                            if (originalChannel && roomData) {
                                // إضافة المنشنات (يمكن إضافة منطق الإضافة هنا)
                                await originalChannel.send(`✅ تم شراء منشنات إضافية بنجاح من قبل <@${message.author.id}>!`);
                            }
                            
                            storage.data.mentionTickets.delete(message.channel.id);
                        }

                        setTimeout(async () => {
                            await message.channel.delete();
                        }, 3000);
                    } else {
                        // إذا لم يتم العثور على رسالة ProBot، إغلاق التكت
                        await message.channel.send('❌ لم يتم العثور على تأكيد الدفع من ProBot. سيتم إغلاق التكت.');
                        
                        // تنظيف بيانات التكت
                        storage.data.mentionTickets?.delete(message.channel.id);
                        
                        setTimeout(async () => {
                            await message.channel.delete();
                        }, 5000);
                    }
                }, 40000); // انتظار 40 ثانية
            }
        }
    }
});

// معالجة التفاعلات
client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;

        try {
            if (commandName === 'create-room') {
                const guildId = interaction.guild.id;
                const userId = interaction.user.id;
                const memberRoles = interaction.member.roles.cache.map(role => role.id);

                if (storage.data.allowedUsers.has(guildId)) {
                    const allowed = storage.data.allowedUsers.get(guildId);
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

                    storage.data.tempRooms.set(channel.id, roomData);
                    storage.data.mentionCounts.set(`${channel.id}-${targetUser.id}`, {
                        everyone: 0,
                        here: 0,
                        shop: 0
                    });

                    setTimeout(async () => {
                        if (storage.data.tempRooms.has(channel.id)) {
                            await channel.delete();
                            storage.data.tempRooms.delete(channel.id);
                            storage.data.mentionCounts.delete(`${channel.id}-${targetUser.id}`);
                        }
                    }, roomData.duration);

                    await interaction.reply({ content: `تم إنشاء الغرفة <#${channel.id}> بنجاح!`, ephemeral: true });

                } catch (error) {
                    console.error('خطأ في إنشاء الغرفة:', error);
                    await interaction.reply({ content: 'حدث خطأ أثناء إنشاء الغرفة!', ephemeral: true });
                }

            } else if (commandName === 'تجديد-المتجر') {
                const guildId = interaction.guild.id;
                const userId = interaction.user.id;
                const memberRoles = interaction.member.roles.cache.map(role => role.id);

                if (storage.data.allowedUsers.has(guildId)) {
                    const allowed = storage.data.allowedUsers.get(guildId);
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

                const roomData = storage.data.tempRooms.get(channel.id);
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

                storage.data.tempRooms.set(channel.id, roomData);

                await interaction.reply({ content: `تم تجديد الغرفة <#${channel.id}> بنجاح!`, ephemeral: true });

            } else if (commandName === 'set-permissions') {
                if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
                    return interaction.reply({ content: 'ليس لديك صلاحية لاستخدام هذا الأمر!', ephemeral: true });
                }

                const user = interaction.options.getUser('user');
                const role = interaction.options.getRole('role');

                if (!user && !role) {
                    return interaction.reply({ content: 'يجب تحديد مستخدم أو رتبة على الأقل!', ephemeral: true });
                }

                const guildId = interaction.guild.id;
                if (!storage.data.allowedUsers.has(guildId)) {
                    storage.data.allowedUsers.set(guildId, { users: [], roles: [] });
                }

                if (user) {
                    storage.data.allowedUsers.get(guildId).users.push(user.id);
                }
                if (role) {
                    storage.data.allowedUsers.get(guildId).roles.push(role.id);
                }

                let response = 'تم تحديث الصلاحيات:\n';
                if (user) response += `• المستخدم: ${user.tag}\n`;
                if (role) response += `• الرتبة: ${role.name}\n`;

                await interaction.reply({ content: response, ephemeral: true });

            } else if (commandName === 'تسطيب-أسعار-التجديد') {
                if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
                    return interaction.reply({ content: 'ليس لديك صلاحية لاستخدام هذا الأمر!', ephemeral: true });
                }

                const guildId = interaction.guild.id;
                if (!storage.data.pricing.has(guildId)) {
                    storage.data.pricing.set(guildId, { renewalPrices: [], mentionPrices: { everyone: 0, here: 0, shop: 0 }, command: 'C', creditReceiver: null });
                }

                const prices = [];
                prices[1] = interaction.options.getInteger('يوم-واحد');
                prices[2] = interaction.options.getInteger('يومين') || 0;
                prices[3] = interaction.options.getInteger('ثلاثة-أيام') || 0;
                prices[4] = interaction.options.getInteger('أربعة-أيام') || 0;
                prices[5] = interaction.options.getInteger('خمسة-أيام') || 0;
                prices[6] = interaction.options.getInteger('ستة-أيام') || 0;
                prices[7] = interaction.options.getInteger('أسبوع') || 0;

                storage.data.pricing.get(guildId).renewalPrices = prices;

                await interaction.reply({ content: 'تم تحديث أسعار التجديد بنجاح!', ephemeral: true });

            } else if (commandName === 'تسطيب-أسعار-المنشنات') {
                if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
                    return interaction.reply({ content: 'ليس لديك صلاحية لاستخدام هذا الأمر!', ephemeral: true });
                }

                const guildId = interaction.guild.id;
                if (!storage.data.pricing.has(guildId)) {
                    storage.data.pricing.set(guildId, { renewalPrices: [], mentionPrices: { everyone: 0, here: 0, shop: 0 }, command: 'C', creditReceiver: null });
                }

                storage.data.pricing.get(guildId).mentionPrices = {
                    everyone: interaction.options.getInteger('سعر-everyone'),
                    here: interaction.options.getInteger('سعر-here'),
                    shop: interaction.options.getInteger('سعر-متجر')
                };

                await interaction.reply({ content: 'تم تحديث أسعار المنشنات بنجاح!', ephemeral: true });

            } else if (commandName === 'تسطيب-امر-الدفع') {
                if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
                    return interaction.reply({ content: 'ليس لديك صلاحية لاستخدام هذا الأمر!', ephemeral: true });
                }

                const guildId = interaction.guild.id;
                if (!storage.data.pricing.has(guildId)) {
                    storage.data.pricing.set(guildId, { renewalPrices: [], mentionPrices: { everyone: 0, here: 0, shop: 0 }, command: 'C', creditReceiver: null });
                }

                storage.data.pricing.get(guildId).command = interaction.options.getString('الامر');
                storage.data.pricing.get(guildId).creditReceiver = interaction.options.getUser('مستلم-الرصيد')?.id || null;

                await interaction.reply({ content: 'تم تحديث أمر الدفع بنجاح!', ephemeral: true });

            } else if (commandName === 'تفعيل-وضع-الصيانة') {
                if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
                    return interaction.reply({ content: 'ليس لديك صلاحية لاستخدام هذا الأمر!', ephemeral: true });
                }

                const confirmed = interaction.options.getBoolean('تأكيد');
                if (!confirmed) {
                    return interaction.reply({ 
                        content: '❌ يجب تأكيد العملية بوضع "True" في خانة التأكيد!', 
                        ephemeral: true 
                    });
                }

                const guildId = interaction.guild.id;

                if (storage.data.maintenanceMode.get(guildId)) {
                    return interaction.reply({
                        content: '⚠️ وضع الصيانة مُفعل مسبقاً!',
                        ephemeral: true
                    });
                }

                await interaction.deferReply({ ephemeral: true });

                try {
                    const channels = interaction.guild.channels.cache.filter(channel => 
                        channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildVoice
                    );

                    const guildPermissions = new Map();
                    let processedCount = 0;
                    let errorCount = 0;

                    for (const [channelId, channel] of channels) {
                        try {
                            // حفظ الأذونات الحالية
                            const everyoneOverwrite = channel.permissionOverwrites.cache.get(interaction.guild.roles.everyone.id);
                            const originalViewChannel = everyoneOverwrite ? everyoneOverwrite.allow.has(PermissionFlagsBits.ViewChannel) : null;

                            guildPermissions.set(channelId, {
                                hadViewChannelAllow: originalViewChannel === true,
                                hadViewChannelDeny: everyoneOverwrite ? everyoneOverwrite.deny.has(PermissionFlagsBits.ViewChannel) : false
                            });

                            // إخفاء الغرفة عن الجميع
                            await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
                                ViewChannel: false
                            });

                            processedCount++;

                            // تأخير صغير لتجنب تجاوز حدود Discord
                            if (processedCount % 10 === 0) {
                                await new Promise(resolve => setTimeout(resolve, 2000));
                            }

                        } catch (error) {
                            console.error(`خطأ في إخفاء الغرفة ${channel.name}:`, error);
                            errorCount++;
                        }
                    }

                    // حفظ الأذونات وحالة الصيانة
                    storage.data.channelPermissions.set(guildId, Object.fromEntries(guildPermissions));
                    storage.data.maintenanceMode.set(guildId, true);
                    await storage.saveData();

                    let resultMessage = `🔧 تم تفعيل وضع الصيانة بنجاح!\n`;
                    resultMessage += `✅ تم إخفاء ${processedCount} غرفة\n`;
                    if (errorCount > 0) {
                        resultMessage += `⚠️ فشل في ${errorCount} غرفة\n`;
                    }
                    resultMessage += `\n🔒 جميع الغرف مخفية عن الأعضاء الآن`;
                    resultMessage += `\n💾 تم حفظ البيانات بنجاح`;

                    await interaction.editReply({ content: resultMessage });

                } catch (error) {
                    console.error('خطأ في تفعيل وضع الصيانة:', error);
                    await interaction.editReply({ content: '❌ حدث خطأ أثناء تفعيل وضع الصيانة!' });
                }

            } else if (commandName === 'اطفاء-وضع-الصيانة') {
                if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
                    return interaction.reply({ content: 'ليس لديك صلاحية لاستخدام هذا الأمر!', ephemeral: true });
                }

                const confirmed = interaction.options.getBoolean('تأكيد');
                if (!confirmed) {
                    return interaction.reply({ 
                        content: '❌ يجب تأكيد العملية بوضع "True" في خانة التأكيد!', 
                        ephemeral: true 
                    });
                }

                const guildId = interaction.guild.id;

                if (!storage.data.maintenanceMode.get(guildId)) {
                    return interaction.reply({
                        content: '⚠️ وضع الصيانة غير مُفعل!',
                        ephemeral: true
                    });
                }

                const savedPermissions = storage.data.channelPermissions.get(guildId);
                if (!savedPermissions) {
                    return interaction.reply({
                        content: '❌ لم يتم العثور على الأذونات المحفوظة! لا يمكن استعادة الحالة السابقة.',
                        ephemeral: true
                    });
                }

                await interaction.deferReply({ ephemeral: true });

                try {
                    const channels = interaction.guild.channels.cache.filter(channel => 
                        channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildVoice
                    );

                    let restoredCount = 0;
                    let errorCount = 0;

                    for (const [channelId, channel] of channels) {
                        try {
                            const savedPerm = savedPermissions[channelId];
                            if (savedPerm) {
                                if (savedPerm.hadViewChannelAllow) {
                                    // كانت الغرفة مفتوحة صراحة
                                    await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
                                        ViewChannel: true
                                    });
                                } else if (savedPerm.hadViewChannelDeny) {
                                    // كانت الغرفة مخفية أصلاً
                                    await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
                                        ViewChannel: false
                                    });
                                } else {
                                    // لم تكن هناك أذونات صريحة، إزالة الحظر
                                    await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
                                        ViewChannel: null
                                    });
                                }
                            } else {
                                // إذا لم تكن محفوظة، إزالة الحظر
                                await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
                                    ViewChannel: null
                                });
                            }

                            restoredCount++;

                            // تأخير صغير لتجنب تجاوز حدود Discord
                            if (restoredCount % 10 === 0) {
                                await new Promise(resolve => setTimeout(resolve, 2000));
                            }

                        } catch (error) {
                            console.error(`خطأ في استعادة الغرفة ${channel.name}:`, error);
                            errorCount++;
                        }
                    }

                    // إزالة حالة الصيانة والأذونات المحفوظة
                    storage.data.maintenanceMode.set(guildId, false);
                    storage.data.channelPermissions.delete(guildId);
                    await storage.saveData();

                    let resultMessage = `🔧 تم إطفاء وضع الصيانة بنجاح!\n`;
                    resultMessage += `✅ تم استعادة ${restoredCount} غرفة\n`;
                    if (errorCount > 0) {
                        resultMessage += `⚠️ فشل في ${errorCount} غرفة\n`;
                    }
                    resultMessage += `\n🔓 تم إعادة جميع الغرف كما كانت سابقاً`;
                    resultMessage += `\n💾 تم حفظ البيانات بنجاح`;

                    await interaction.editReply({ content: resultMessage });

                } catch (error) {
                    console.error('خطأ في إطفاء وضع الصيانة:', error);
                    await interaction.editReply({ content: '❌ حدث خطأ أثناء إطفاء وضع الصيانة!' });
                }

            } else if (commandName === 'حالة-البيانات') {
                const embed = new EmbedBuilder()
                    .setTitle('📊 حالة البيانات المحفوظة')
                    .setColor(0x00AE86)
                    .addFields(
                        { name: '🗄️ إعدادات السيرفرات', value: `${storage.data.serverSettings.size} سيرفر`, inline: true },
                        { name: '🔧 وضع الصيانة', value: `${Array.from(storage.data.maintenanceMode.values()).filter(m => m).length} سيرفر مُفعل`, inline: true },
                        { name: '🔐 أذونات الغرف', value: `${storage.data.channelPermissions.size} سيرفر محفوظ`, inline: true },
                        { name: '🏠 الغرف المؤقتة', value: `${storage.data.tempRooms.size} غرفة`, inline: true },
                        { name: '👥 المستخدمين المسموحين', value: `${storage.data.allowedUsers.size} سيرفر`, inline: true },
                        { name: '💰 إعدادات التسعير', value: `${storage.data.pricing.size} سيرفر`, inline: true }
                    )
                    .setTimestamp()
                    .setFooter({ text: 'يتم الحفظ التلقائي كل 5 دقائق' });

                await interaction.reply({ embeds: [embed], ephemeral: true });

            } else if (commandName === 'حفظ-البيانات') {
                if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
                    return interaction.reply({ content: 'ليس لديك صلاحية لاستخدام هذا الأمر!', ephemeral: true });
                }

                await storage.saveData();
                await interaction.reply({ 
                    content: '💾 تم حفظ البيانات بنجاح!', 
                    ephemeral: true 
                });

            } else if (commandName === 'حذف-غرف-متعددة') {
                if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
                    return interaction.reply({ 
                        content: '❌ ليس لديك صلاحية إدارة الغرف!', 
                        ephemeral: true 
                    });
                }

                // جمع جميع الغرف المحددة
                const channelsToDelete = [];
                for (let i = 1; i <= 10; i++) {
                    const channel = interaction.options.getChannel(`غرفة-${i}`);
                    if (channel) {
                        channelsToDelete.push(channel);
                    }
                }

                if (channelsToDelete.length === 0) {
                    return interaction.reply({
                        content: '❌ يجب اختيار غرفة واحدة على الأقل للحذف!',
                        ephemeral: true
                    });
                }

                // إنشاء رسالة تأكيد
                const embed = new EmbedBuilder()
                    .setTitle('🗑️ تأكيد حذف الغرف')
                    .setColor(0xFF0000)
                    .setDescription(`⚠️ **تحذير:** سيتم حذف الغرف التالية نهائياً:\n\n${channelsToDelete.map(ch => `🗑️ ${ch.name}`).join('\n')}\n\n**هذا الإجراء لا يمكن التراجع عنه!**`)
                    .addFields(
                        { name: '📊 إجمالي الغرف للحذف', value: `${channelsToDelete.length}`, inline: true }
                    )
                    .setTimestamp();

                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('confirm_simple_delete')
                            .setLabel('✅ تأكيد الحذف')
                            .setStyle(ButtonStyle.Danger),
                        new ButtonBuilder()
                            .setCustomId('cancel_simple_delete')
                            .setLabel('❌ إلغاء')
                            .setStyle(ButtonStyle.Secondary)
                    );

                // حفظ بيانات العملية مؤقتاً
                storage.data.tempSimpleDelete = storage.data.tempSimpleDelete || new Map();
                storage.data.tempSimpleDelete.set(interaction.user.id, {
                    channels: channelsToDelete.map(ch => ch.id),
                    guildId: interaction.guild.id,
                    timestamp: Date.now()
                });

                await interaction.reply({
                    embeds: [embed],
                    components: [row],
                    ephemeral: true
                });
            } else if (commandName === 'send_message') {
                const targetUser = interaction.options.getUser('user');
                const messageContent = interaction.options.getString('message');
                const shouldMention = interaction.options.getBoolean('mention') || false;

                try {
                    let finalMessage = messageContent;
                    if (shouldMention) {
                        finalMessage = `${targetUser}, ${messageContent}`;
                    }

                    await targetUser.send(finalMessage);
                    await interaction.reply({ 
                        content: `✅ تم إرسال الرسالة إلى ${targetUser.tag} بنجاح!`, 
                        ephemeral: true 
                    });
                } catch (error) {
                    await interaction.reply({ 
                        content: '❌ فشل في إرسال الرسالة! ربما المستخدم لديه الرسائل الخاصة مغلقة.', 
                        ephemeral: true 
                    });
                }

            } else if (commandName === 'send_to_multiple') {
                const count = interaction.options.getInteger('count');
                const messageContent = interaction.options.getString('message');
                const shouldMention = interaction.options.getBoolean('mention') || false;

                try {
                    await interaction.deferReply({ ephemeral: true });

                    const members = await interaction.guild.members.fetch();
                    const realMembers = members.filter(member => !member.user.bot);

                    if (realMembers.size < count) {
                        return interaction.editReply({ 
                            content: `❌ عدد الأعضاء الحقيقيين في السيرفر (${realMembers.size}) أقل من العدد المطلوب (${count})!` 
                        });
                    }

                    const selectedMembers = realMembers.random(count);
                    let successCount = 0;
                    let failCount = 0;

                    for (const member of selectedMembers) {
                        try {
                            let finalMessage = messageContent;
                            if (shouldMention) {
                                finalMessage = `${member.user}, ${messageContent}`;
                            }

                            await member.user.send(finalMessage);
                            successCount++;
                        } catch {
                            failCount++;
                        }
                    }

                    await interaction.editReply({ 
                        content: `📊 تم إرسال الرسائل:\n✅ نجح: ${successCount}\n❌ فشل: ${failCount}` 
                    });
                } catch (error) {
                    await interaction.editReply({ 
                        content: '❌ حدث خطأ أثناء إرسال الرسائل!' 
                    });
                }

            } else if (commandName === 'قفل-الروم') {
                if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
                    return interaction.reply({ content: 'ليس لديك صلاحية لاستخدام هذا الأمر!', ephemeral: true });
                }

                const targetChannel = interaction.options.getChannel('الغرفة') || interaction.channel;
                const useText = interaction.options.getBoolean('كتابي') || false;

                try {
                    await targetChannel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
                        SendMessages: false,
                        CreatePrivateThreads: false,
                        CreatePublicThreads: false
                    });

                    let response = `🔒 تم قفل الغرفة ${targetChannel.name} بنجاح!`;
                    if (useText) {
                        saveTextCommandSettings(interaction.guild.id, 'lock', true);
                        response += '\n💡 تم تفعيل الأمر الكتابي: `قفل` لقفل الغرفة الحالية';
                    }

                    await interaction.reply({ content: response, ephemeral: true });
                } catch (error) {
                    await interaction.reply({ content: 'حدث خطأ أثناء قفل الغرفة!', ephemeral: true });
                }

            } else if (commandName === 'فتح-الروم') {
                if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
                    return interaction.reply({ content: 'ليس لديك صلاحية لاستخدام هذا الأمر!', ephemeral: true });
                }

                const targetChannel = interaction.options.getChannel('الغرفة') || interaction.channel;
                const useText = interaction.options.getBoolean('كتابي') || false;

                try {
                    await targetChannel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
                        SendMessages: null,
                        CreatePrivateThreads: null,
                        CreatePublicThreads: null
                    });

                    let response = `🔓 تم فتح الغرفة ${targetChannel.name} بنجاح!`;
                    if (useText) {
                        saveTextCommandSettings(interaction.guild.id, 'unlock', true);
                        response += '\n💡 تم تفعيل الأمر الكتابي: `فتح` لفتح الغرفة الحالية';
                    }

                    await interaction.reply({ content: response, ephemeral: true });
                } catch (error) {
                    await interaction.reply({ content: 'حدث خطأ أثناء فتح الغرفة!', ephemeral: true });
                }

            } else if (commandName === 'مسح-الرسائل') {
                if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
                    return interaction.reply({ content: 'ليس لديك صلاحية لاستخدام هذا الأمر!', ephemeral: true });
                }

                const deleteCount = interaction.options.getInteger('العدد');
                const useText = interaction.options.getBoolean('كتابي') || false;

                try {
                    const messages = await interaction.channel.messages.fetch({ limit: deleteCount });
                    await interaction.channel.bulkDelete(messages);

                    let response = `🗑️ تم مسح ${deleteCount} رسالة بنجاح!`;
                    if (useText) {
                        saveTextCommandSettings(interaction.guild.id, 'clear', true);
                        response += '\n💡 تم تفعيل الأمر الكتابي: `مسح 10` لمسح الرسائل بسرعة';
                    }

                    await interaction.reply({ content: response, ephemeral: true });
                } catch (error) {
                    await interaction.reply({ content: 'حدث خطأ أثناء مسح الرسائل!', ephemeral: true });
                }

            } else if (commandName === 'حظر-المستخدم') {
                if (!interaction.member.permissions.has(PermissionFlagsBits.BanMembers)) {
                    return interaction.reply({ content: 'ليس لديك صلاحية لاستخدام هذا الأمر!', ephemeral: true });
                }

                const targetUser = interaction.options.getUser('المستخدم');
                const reason = interaction.options.getString('السبب') || 'لم يتم تحديد سبب';
                const useText = interaction.options.getBoolean('كتابي') || false;

                try {
                    await interaction.guild.bans.create(targetUser, { reason });

                    let response = `🔨 تم حظر ${targetUser.tag} بنجاح!\nالسبب: ${reason}`;
                    if (useText) {
                        saveTextCommandSettings(interaction.guild.id, 'ban', true);
                        response += '\n💡 تم تفعيل الأمر الكتابي: `حظر @شخص` لحظر الأشخاص بسرعة';
                    }

                    await interaction.reply({ content: response, ephemeral: true });
                } catch (error) {
                    await interaction.reply({ content: 'حدث خطأ أثناء حظر المستخدم!', ephemeral: true });
                }

            } else if (commandName === 'طرد-المستخدم') {
                if (!interaction.member.permissions.has(PermissionFlagsBits.KickMembers)) {
                    return interaction.reply({ content: 'ليس لديك صلاحية لاستخدام هذا الأمر!', ephemeral: true });
                }

                const targetUser = interaction.options.getUser('المستخدم');
                const reason = interaction.options.getString('السبب') || 'لم يتم تحديد سبب';
                const useText = interaction.options.getBoolean('كتابي') || false;

                try {
                    const member = await interaction.guild.members.fetch(targetUser.id);
                    await member.kick(reason);

                    let response = `👢 تم طرد ${targetUser.tag} بنجاح!\nالسبب: ${reason}`;
                    if (useText) {
                        saveTextCommandSettings(interaction.guild.id, 'kick', true);
                        response += '\n💡 تم تفعيل الأمر الكتابي: `طرد @شخص` لطرد الأشخاص بسرعة';
                    }

                    await interaction.reply({ content: response, ephemeral: true });
                } catch (error) {
                    await interaction.reply({ content: 'حدث خطأ أثناء طرد المستخدم!', ephemeral: true });
                }

            } else if (commandName === 'اعطاء-رتبة') {
                if (!interaction.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
                    return interaction.reply({ content: 'ليس لديك صلاحية لاستخدام هذا الأمر!', ephemeral: true });
                }

                const targetUser = interaction.options.getUser('المستخدم');
                const role = interaction.options.getRole('الرتبة');
                const useText = interaction.options.getBoolean('كتابي') || false;

                try {
                    const member = await interaction.guild.members.fetch(targetUser.id);
                    await member.roles.add(role);

                    let response = `✅ تم إعطاء رتبة ${role.name} للمستخدم ${targetUser.tag}`;
                    if (useText) {
                        saveTextCommandSettings(interaction.guild.id, 'addrole', true);
                        response += '\n💡 تم تفعيل الأمر الكتابي: `اعطاء @شخص @رتبة` لإعطاء الرتب بسرعة';
                    }

                    await interaction.reply({ content: response, ephemeral: true });
                } catch (error) {
                    await interaction.reply({ content: 'حدث خطأ أثناء إعطاء الرتبة!', ephemeral: true });
                }

            } else if (commandName === 'سحب-رتبة') {
                if (!interaction.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
                    return interaction.reply({ content: 'ليس لديك صلاحية لاستخدام هذا الأمر!', ephemeral: true });
                }

                const targetUser = interaction.options.getUser('المستخدم');
                const role = interaction.options.getRole('الرتبة');
                const useText = interaction.options.getBoolean('كتابي') || false;

                try {
                    const member = await interaction.guild.members.fetch(targetUser.id);
                    await member.roles.remove(role);

                    let response = `❌ تم سحب رتبة ${role.name} من المستخدم ${targetUser.tag}`;
                    if (useText) {
                        saveTextCommandSettings(interaction.guild.id, 'removerole', true);
                        response += '\n💡 تم تفعيل الأمر الكتابي: `سحب @شخص @رتبة` لسحب الرتب بسرعة';
                    }

                    await interaction.reply({ content: response, ephemeral: true });
                } catch (error) {
                    await interaction.reply({ content: 'حدث خطأ أثناء سحب الرتبة!', ephemeral: true });
                }

            } else if (commandName === 'تغيير-اسم-الروم') {
                if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
                    return interaction.reply({ content: 'ليس لديك صلاحية لاستخدام هذا الأمر!', ephemeral: true });
                }

                const newName = interaction.options.getString('الاسم-الجديد');
                const targetChannel = interaction.options.getChannel('الغرفة') || interaction.channel;
                const useText = interaction.options.getBoolean('كتابي') || false;

                try {
                    await targetChannel.setName(newName);

                    let response = `✅ تم تغيير اسم الغرفة إلى: ${newName}`;
                    if (useText) {
                        saveTextCommandSettings(interaction.guild.id, 'rename', true);
                        response += '\n💡 تم تفعيل الأمر الكتابي: `تغيير-اسم اسم-جديد` لتغيير أسماء الغرف بسرعة';
                    }

                    await interaction.reply({ content: response, ephemeral: true });
                } catch (error) {
                    await interaction.reply({ content: 'حدث خطأ أثناء تغيير اسم الغرفة!', ephemeral: true });
                }

            } else if (commandName === 'تغيير-جميع-الرومات') {
                if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
                    return interaction.reply({ content: 'ليس لديك صلاحية لاستخدام هذا الأمر!', ephemeral: true });
                }

                const newName = interaction.options.getString('الاسم-الجديد');

                await interaction.deferReply({ ephemeral: true });

                try {
                    const channels = interaction.guild.channels.cache.filter(channel => 
                        channel.type === ChannelType.GuildText
                    );

                    let successCount = 0;
                    let errorCount = 0;

                    for (const [channelId, channel] of channels) {
                        try {
                            await channel.setName(newName);
                            successCount++;
                            await new Promise(resolve => setTimeout(resolve, 2000)); // تأخير لتجنب الحدود
                        } catch (error) {
                            errorCount++;
                        }
                    }

                    await interaction.editReply({
                        content: `✅ تم تغيير أسماء الغرف:\n• نجح: ${successCount} غرفة\n• فشل: ${errorCount} غرفة`
                    });
                } catch (error) {
                    await interaction.editReply({ content: 'حدث خطأ أثناء تغيير أسماء الغرف!' });
                }

            } else if (commandName === 'ارسال-ايمبد') {
                if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
                    return interaction.reply({ content: 'ليس لديك صلاحية لاستخدام هذا الأمر!', ephemeral: true });
                }

                const messageAbove = interaction.options.getString('رسالة-فوق-الايمبد');
                const embedTitle = interaction.options.getString('عنوان-الايمبد');
                const embedContent = interaction.options.getString('محتوى-الايمبد');
                const interactionType = interaction.options.getString('نوع-التفاعل');
                const category = interaction.options.getChannel('كاتيجوري-التكتات');
                const staffRole = interaction.options.getRole('رتبة-الموظفين');
                const embedColor = interaction.options.getString('لون-الايمبد') || '#0099FF';
                const embedImage = interaction.options.getString('صورة-الايمبد');

                const buttonTexts = [];
                buttonTexts.push(interaction.options.getString('نص-الزر-الاول'));
                if (interaction.options.getString('نص-الزر-الثاني')) buttonTexts.push(interaction.options.getString('نص-الزر-الثاني'));
                if (interaction.options.getString('نص-الزر-الثالث')) buttonTexts.push(interaction.options.getString('نص-الزر-الثالث'));
                if (interaction.options.getString('نص-الزر-الرابع')) buttonTexts.push(interaction.options.getString('نص-الزر-الرابع'));
                if (interaction.options.getString('نص-الزر-الخامس')) buttonTexts.push(interaction.options.getString('نص-الزر-الخامس'));

                // التحقق من وجود الكاتيجوري والرتبة
                if (!category) {
                    return interaction.reply({ content: '❌ يجب اختيار كاتيجوري صالح!', ephemeral: true });
                }

                if (!staffRole) {
                    return interaction.reply({ content: '❌ يجب اختيار رتبة موظفين صالحة!', ephemeral: true });
                }

                // التحقق من نوع الكاتيجوري
                if (category.type !== ChannelType.GuildCategory) {
                    return interaction.reply({ content: '❌ يجب اختيار كاتيجوري وليس غرفة عادية!', ephemeral: true });
                }

                // إنشاء الإيمبد
                const embed = new EmbedBuilder()
                    .setTitle(embedTitle)
                    .setDescription(embedContent)
                    .setColor(embedColor)
                    .setTimestamp();

                if (embedImage) {
                    embed.setImage(embedImage);
                }

                // إنشاء المكونات حسب النوع
                let components = [];
                const guildId = interaction.guild.id;

                // إنشاء معرف فريد للإيمبد
                if (!storage.data.embedsData.has(guildId)) {
                    storage.data.embedsData.set(guildId, []);
                }
                const embedsArray = storage.data.embedsData.get(guildId);
                const embedId = embedsArray.length;

                if (interactionType === 'single_button') {
                    const row = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId(`ticket_embed_${embedId}_0`)
                                .setLabel(buttonTexts[0])
                                .setStyle(ButtonStyle.Primary)
                                .setEmoji('🎫')
                        );
                    components.push(row);
                } else if (interactionType === 'multiple_buttons') {
                    const row = new ActionRowBuilder();
                    for (let i = 0; i < Math.min(buttonTexts.length, 5); i++) {
                        row.addComponents(
                            new ButtonBuilder()
                                .setCustomId(`ticket_embed_${embedId}_${i}`)
                                .setLabel(buttonTexts[i])
                                .setStyle(ButtonStyle.Primary)
                                .setEmoji('🎫')
                        );
                    }
                    components.push(row);
                } else if (interactionType === 'select_menu') {
                    const selectOptions = [];
                    for (let i = 0; i < Math.min(buttonTexts.length, 25); i++) {
                        selectOptions.push({
                            label: buttonTexts[i],
                            value: `ticket_embed_${embedId}_${i}`,
                            emoji: '🎫'
                        });
                    }

                    const selectMenu = new ActionRowBuilder()
                        .addComponents(
                            new StringSelectMenuBuilder()
                                .setCustomId(`ticket_select_${embedId}`)
                                .setPlaceholder('اختر نوع التكت')
                                .addOptions(selectOptions)
                        );
                    components.push(selectMenu);
                }

                // حفظ بيانات الإيمبد
                const embedData = {
                    id: embedId,
                    title: embedTitle,
                    content: embedContent,
                    categoryId: category.id,
                    staffRoleId: staffRole.id,
                    buttonTexts: buttonTexts,
                    interactionType: interactionType,
                    channelId: interaction.channel.id,
                    messageId: null,
                    createdAt: Date.now()
                };

                embedsArray.push(embedData);
                storage.data.embedsData.set(guildId, embedsArray);

                // إنشاء عداد التكتات للإيمبد
                if (!storage.data.ticketEmbedCounters.has(guildId)) {
                    storage.data.ticketEmbedCounters.set(guildId, {});
                }
                const counters = storage.data.ticketEmbedCounters.get(guildId);
                counters[embedId] = 0;

                // إرسال الرسالة
                const messageOptions = { embeds: [embed], components: components };
                if (messageAbove) {
                    messageOptions.content = messageAbove;
                }

                const sentMessage = await interaction.channel.send(messageOptions);
                
                // حفظ معرف الرسالة
                embedData.messageId = sentMessage.id;
                storage.saveData();

                await interaction.reply({ content: `✅ تم إرسال الإيمبد بنجاح! رقم الإيمبد: ${embedId}`, ephemeral: true });

            } else if (commandName === 'ادارة-الايمبدات') {
                if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
                    return interaction.reply({ content: 'ليس لديك صلاحية لاستخدام هذا الأمر!', ephemeral: true });
                }

                const operation = interaction.options.getString('العملية');
                const embedNumber = interaction.options.getInteger('رقم-الايمبد');
                const newCategory = interaction.options.getChannel('كاتيجوري-جديد');
                const guildId = interaction.guild.id;

                const embedsArray = storage.data.embedsData.get(guildId) || [];

                if (operation === 'list_all') {
                    if (embedsArray.length === 0) {
                        return interaction.reply({ content: '❌ لا توجد إيمبدات محفوظة في هذا السيرفر!', ephemeral: true });
                    }

                    const embed = new EmbedBuilder()
                        .setTitle('📋 قائمة الإيمبدات')
                        .setColor(0x00AE86)
                        .setTimestamp();

                    let description = '';
                    for (let i = 0; i < embedsArray.length; i++) {
                        const embedData = embedsArray[i];
                        const channel = await interaction.guild.channels.fetch(embedData.channelId).catch(() => null);
                        const category = await interaction.guild.channels.fetch(embedData.categoryId).catch(() => null);
                        
                        description += `**${i}:** ${embedData.title}\n`;
                        description += `📍 الغرفة: ${channel ? channel.name : 'محذوفة'}\n`;
                        description += `📁 الكاتيجوري: ${category ? category.name : 'محذوف'}\n`;
                        description += `🔘 الأزرار: ${embedData.buttonTexts.length}\n\n`;
                    }

                    embed.setDescription(description);
                    await interaction.reply({ embeds: [embed], ephemeral: true });

                } else if (operation === 'delete_embed') {
                    if (embedNumber === null) {
                        return interaction.reply({ content: '❌ يجب تحديد رقم الإيمبد للحذف!', ephemeral: true });
                    }

                    if (embedNumber >= embedsArray.length) {
                        return interaction.reply({ content: '❌ لقد اخترت فوق العدد الموجود!', ephemeral: true });
                    }

                    const embedData = embedsArray[embedNumber];
                    
                    // حذف الرسالة إذا كانت موجودة
                    try {
                        const channel = await interaction.guild.channels.fetch(embedData.channelId);
                        const message = await channel.messages.fetch(embedData.messageId);
                        await message.delete();
                    } catch (error) {
                        console.log('فشل في حذف الرسالة الأصلية');
                    }

                    // حذف الإيمبد من البيانات
                    embedsArray.splice(embedNumber, 1);
                    storage.data.embedsData.set(guildId, embedsArray);
                    storage.saveData();

                    await interaction.reply({ content: `✅ تم حذف الإيمبد رقم ${embedNumber} بنجاح!`, ephemeral: true });

                } else if (operation === 'edit_category') {
                    if (embedNumber === null || !newCategory) {
                        return interaction.reply({ content: '❌ يجب تحديد رقم الإيمبد والكاتيجوري الجديد!', ephemeral: true });
                    }

                    if (embedNumber >= embedsArray.length) {
                        return interaction.reply({ content: '❌ لقد اخترت فوق العدد الموجود!', ephemeral: true });
                    }

                    if (newCategory.type !== ChannelType.GuildCategory) {
                        return interaction.reply({ content: '❌ يجب اختيار كاتيجوري وليس غرفة عادية!', ephemeral: true });
                    }

                    embedsArray[embedNumber].categoryId = newCategory.id;
                    storage.data.embedsData.set(guildId, embedsArray);
                    storage.saveData();

                    await interaction.reply({ content: `✅ تم تحديث كاتيجوري الإيمبد رقم ${embedNumber} إلى ${newCategory.name}!`, ephemeral: true });
                }

            }

        } catch (error) {
            console.error('خطأ في معالجة الأمر:', error);

            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: '❌ حدث خطأ أثناء تنفيذ الأمر!',
                    ephemeral: true
                });
            }
        }

    } else if (interaction.isButton()) {
        if (interaction.customId === 'confirm_simple_delete') {
            const deleteData = storage.data.tempSimpleDelete?.get(interaction.user.id);

            if (!deleteData || Date.now() - deleteData.timestamp > 300000) { // 5 دقائق
                return interaction.reply({
                    content: '❌ انتهت صلاحية العملية! يرجى تنفيذ الأمر مرة أخرى.',
                    ephemeral: true
                });
            }

            if (deleteData.guildId !== interaction.guild.id) {
                return interaction.reply({
                    content: '❌ لا يمكن تنفيذ هذه العملية في هذا السيرفر!',
                    ephemeral: true
                });
            }

            await interaction.deferUpdate();

            try {
                let deletedCount = 0;
                let failedCount = 0;
                const deletedChannels = [];
                const failedChannels = [];

                for (const channelId of deleteData.channels) {
                    try {
                        const channel = interaction.guild.channels.cache.get(channelId);
                        if (channel) {
                            const channelName = channel.name;
                            await channel.delete('حذف متعدد بواسطة البوت');
                            deletedCount++;
                            deletedChannels.push(channelName);

                            // تأخير صغير لتجنب تجاوز حدود Discord
                            await new Promise(resolve => setTimeout(resolve, 1000));
                        }
                    } catch (error) {
                        failedCount++;
                        const channel = interaction.guild.channels.cache.get(channelId);
                        failedChannels.push(channel ? channel.name : `غرفة غير معروفة (${channelId})`);
                        console.error(`فشل في حذف الغرفة ${channelId}:`, error);
                    }
                }

                // تنظيف البيانات المؤقتة
                storage.data.tempSimpleDelete.delete(interaction.user.id);

                const resultEmbed = new EmbedBuilder()
                    .setTitle('✅ تم تنفيذ عملية الحذف')
                    .setColor(deletedCount > 0 ? 0x00FF00 : 0xFF0000)
                    .addFields(
                        { name: '✅ تم حذفها بنجاح', value: `${deletedCount} غرفة`, inline: true },
                        { name: '❌ فشل في حذفها', value: `${failedCount} غرفة`, inline: true }
                    )
                    .setTimestamp();

                if (deletedChannels.length > 0) {
                    resultEmbed.addFields({
                        name: '🗑️ الغرف المحذوفة',
                        value: deletedChannels.slice(0, 10).join('\n') + (deletedChannels.length > 10 ? `\n... و ${deletedChannels.length - 10} غرفة أخرى` : ''),
                        inline: false
                    });
                }

                if (failedChannels.length > 0) {
                    resultEmbed.addFields({
                        name: '⚠️ الغرف التي فشل حذفها',
                        value: failedChannels.slice(0, 5).join('\n') + (failedChannels.length > 5 ? `\n... و ${failedChannels.length - 5} غرفة أخرى` : ''),
                        inline: false
                    });
                }

                await interaction.editReply({
                    embeds: [resultEmbed],
                    components: []
                });

            } catch (error) {
                console.error('خطأ في حذف الغرف:', error);
                await interaction.editReply({
                    content: '❌ حدث خطأ أثناء حذف الغرف!',
                    embeds: [],
                    components: []
                });
            }

        } else if (interaction.customId === 'cancel_simple_delete') {
            // تنظيف البيانات المؤقتة
            storage.data.tempSimpleDelete?.delete(interaction.user.id);

            await interaction.update({
                content: '❌ تم إلغاء عملية حذف الغرف',
                embeds: [],
                components: []
            });

        } else if (interaction.customId === 'shop_renewal') {
            const roomData = storage.data.tempRooms.get(interaction.channel.id);
            if (roomData && interaction.user.id !== roomData.userId) {
                return interaction.reply({ 
                    content: '❌ فقط المستخدم المخول للتحدث في هذه الغرفة يمكنه استخدام هذه الأزرار!', 
                    ephemeral: true 
                });
            }

            const guildId = interaction.guild.id;

            if (!storage.data.ticketCounters.has(guildId)) {
                storage.data.ticketCounters.set(guildId, { renewal: 0, mention: 0 });
            }

            const counter = storage.data.ticketCounters.get(guildId);
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

            // إضافة صلاحيات للأدمنز
            const adminMembers = interaction.guild.members.cache.filter(member => 
                member.permissions.has(PermissionFlagsBits.Administrator)
            );
            
            for (const [memberId, member] of adminMembers) {
                await ticketChannel.permissionOverwrites.create(memberId, {
                    ViewChannel: true,
                    SendMessages: true
                });
            }

            // حفظ معلومات التكت مع الغرفة الأصلية
            if (!storage.data.renewalTickets) {
                storage.data.renewalTickets = new Map();
            }
            storage.data.renewalTickets.set(ticketChannel.id, {
                originalChannelId: interaction.channel.id,
                userId: interaction.user.id,
                guildId: guildId
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

        } else if (interaction.customId === 'buy_mentions') {
            const roomData = storage.data.tempRooms.get(interaction.channel.id);
            if (roomData && interaction.user.id !== roomData.userId) {
                return interaction.reply({ 
                    content: '❌ فقط المستخدم المخول للتحدث في هذه الغرفة يمكنه استخدام هذه الأزرار!', 
                    ephemeral: true 
                });
            }

            const guildId = interaction.guild.id;

            if (!storage.data.ticketCounters.has(guildId)) {
                storage.data.ticketCounters.set(guildId, { renewal: 0, mention: 0 });
            }

            const counter = storage.data.ticketCounters.get(guildId);
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

            // إضافة صلاحيات للأدمنز
            const adminMembers = interaction.guild.members.cache.filter(member => 
                member.permissions.has(PermissionFlagsBits.Administrator)
            );
            
            for (const [memberId, member] of adminMembers) {
                await ticketChannel.permissionOverwrites.create(memberId, {
                    ViewChannel: true,
                    SendMessages: true
                });
            }

            // حفظ معلومات التكت مع الغرفة الأصلية
            if (!storage.data.mentionTickets) {
                storage.data.mentionTickets = new Map();
            }
            storage.data.mentionTickets.set(ticketChannel.id, {
                originalChannelId: interaction.channel.id,
                userId: interaction.user.id,
                guildId: guildId
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

        } else if (interaction.customId.startsWith('copy_mention_form_')) {
            const formText = `كم منشن تريد؟
يرجى تعبئتها
everyone: ؟
here: ؟
منشن متجر: ؟`;

            await interaction.reply({ content: `\`\`\`${formText}\`\`\``, ephemeral: true });

        } else if (interaction.customId.startsWith('ticket_embed_')) {
            // معالجة أزرار الإيمبدات
            const parts = interaction.customId.split('_');
            const embedId = parseInt(parts[2]);
            const buttonIndex = parseInt(parts[3]);

            await createTicketFromEmbed(interaction, embedId, buttonIndex);

        } else if (interaction.customId === 'claim_ticket') {
            // استلام التكت
            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
                return interaction.reply({ content: '❌ ليس لديك صلاحية لاستلام التكت!', ephemeral: true });
            }

            // منع المنشئ من استلام تكته
            if (interaction.channel.topic && interaction.channel.topic.includes(interaction.user.id)) {
                return interaction.reply({ content: '❌ لا يمكنك استلام التكت الخاص بك!', ephemeral: true });
            }

            const embed = new EmbedBuilder()
                .setTitle('✋ تم استلام التكت')
                .setDescription(`تم استلام هذا التكت بواسطة ${interaction.user}`)
                .setColor(0xFFFF00)
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });

            // تعديل الأذونات لمنع باقي الموظفين من الكتابة
            const staffRoleId = interaction.channel.permissionOverwrites.cache.find(
                overwrite => overwrite.type === 'role' && overwrite.allow.has(PermissionFlagsBits.SendMessages)
            )?.id;

            if (staffRoleId) {
                await interaction.channel.permissionOverwrites.edit(staffRoleId, {
                    SendMessages: false
                });
                await interaction.channel.permissionOverwrites.edit(interaction.user.id, {
                    SendMessages: true
                });
            }

        } else if (interaction.customId === 'close_ticket') {
            // إغلاق التكت
            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
                return interaction.reply({ content: '❌ ليس لديك صلاحية لإغلاق التكت!', ephemeral: true });
            }

            // منع المنشئ من إغلاق تكته
            if (interaction.channel.topic && interaction.channel.topic.includes(interaction.user.id)) {
                return interaction.reply({ content: '❌ لا يمكنك إغلاق التكت الخاص بك!', ephemeral: true });
            }

            const embed = new EmbedBuilder()
                .setTitle('🔒 سيتم إغلاق التكت')
                .setDescription(`سيتم حذف هذا التكت خلال 5 ثوانٍ...`)
                .setColor(0xFF0000)
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });

            setTimeout(async () => {
                try {
                    await interaction.channel.delete();
                } catch (error) {
                    console.error('خطأ في حذف التكت:', error);
                }
            }, 5000);
        }

    } else if (interaction.isStringSelectMenu()) {
        if (interaction.customId.startsWith('ticket_select_')) {
            // معالجة شريط الاختيار
            const embedId = parseInt(interaction.customId.split('_')[2]);
            const selectedValue = interaction.values[0];
            const buttonIndex = parseInt(selectedValue.split('_')[3]);

            await createTicketFromEmbed(interaction, embedId, buttonIndex);
        }

    } else if (interaction.isModalSubmit()) {
        if (interaction.customId.startsWith('renewal_modal_')) {
            const channelId = interaction.customId.split('_')[2];
            const days = parseInt(interaction.fields.getTextInputValue('days_input'));
            const guildId = interaction.guild.id;

            const guildPricing = storage.data.pricing.get(guildId);
            if (!guildPricing || !guildPricing.renewalPrices[days]) {
                return interaction.reply({ content: 'لم يتم تحديد سعر لهذا العدد من الأيام!', ephemeral: true });
            }

            const price = guildPricing.renewalPrices[days];
            const command = guildPricing.command;
            const creditReceiverId = guildPricing.creditReceiver;

            let paymentCommand = `${command} `;
            if (creditReceiverId) {
                paymentCommand += `<@${creditReceiverId}> ${price}`;
            } else {
                paymentCommand += `<@${interaction.user.id}> ${price}`;
            }

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

// حفظ البيانات عند إغلاق البوت
process.on('SIGINT', async () => {
    console.log('جاري إيقاف البوت وحفظ البيانات...');
    await storage.saveData();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('جاري إيقاف البوت وحفظ البيانات...');
    await storage.saveData();
    process.exit(0);
});

// معالجة الأخطاء
client.on('error', error => {
    console.error('خطأ في البوت:', error);
});

// إعداد خادم HTTP
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('🤖 Discord Bot is running!\nبوت ديسكورد يعمل بنجاح مع نظام الغرف المؤقتة!');
});

const PORT = process.env.PORT || 5001; // استخدام بورت مختلف
server.listen(PORT, '0.0.0.0', () => {
    console.log(`HTTP Server is running on port ${PORT}`);
});

// تشغيل البوت
if (TOKEN && CLIENT_ID) {
    client.login(TOKEN);
} else {
    console.error('يرجى إضافة DISCORD_TOKEN و CLIENT_ID في الـ Secrets!');
}
