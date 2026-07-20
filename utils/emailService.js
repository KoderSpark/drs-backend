const nodemailer = require('nodemailer');
const net = require('net'); // [DEBUG] Added for connectivity test

// Initialize Nodemailer transporter
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.sendgrid.net',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_PORT === '465', // true for 465, false for other ports
    auth: {
        user: process.env.SMTP_USER || 'apikey',
        pass: process.env.SMTP_PASS || process.env.SENDGRID_API_KEY
    }
});

// Helper to sleep
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// [DEBUG] Temporary connectivity test to verify if Render can reach the SMTP server
async function testSmtpConnectivity() {
    return new Promise((resolve) => {
        const host = process.env.SMTP_HOST || 'smtp.sendgrid.net';
        const port = parseInt(process.env.SMTP_PORT || '587');
        console.log(`[NETWORK] Testing connectivity to SMTP server ${host}:${port}...`);
        
        const socket = new net.Socket();
        
        socket.setTimeout(5000);
        
        socket.on('connect', () => {
            console.log(`[NETWORK] SMTP server reachable at ${host}:${port}.`);
            socket.destroy();
            resolve(true);
        });
        
        socket.on('error', (e) => {
            console.error(`[ERROR] [NETWORK] Failed to reach SMTP server: ${e.message}`);
            socket.destroy();
            resolve(false);
        });
        
        socket.on('timeout', () => {
            console.error('[ERROR] [NETWORK] Connection to SMTP server timed out after 5s.');
            socket.destroy();
            resolve(false);
        });
        
        socket.connect(port, host);
    });
}

// [DEBUG] Helper to analyze error type based on message and response
function analyzeError(err) {
    const msg = err.message || '';
    if (msg.includes('ENOTFOUND') || msg.includes('EAI_AGAIN')) return 'DNS resolution failure';
    if (msg.includes('ECONNREFUSED')) return 'SMTP connection refused';
    if (msg.includes('ECONNRESET') || msg.includes('socket hang up')) return 'Socket timeout or reset';
    if (msg.includes('EPROTO') || msg.includes('CERT_')) return 'TLS handshake failure';
    if (err.responseCode === 535 || msg.includes('Invalid login')) return 'Authentication failure (Invalid SMTP User/Pass)';
    if (err.responseCode === 550 || msg.includes('Sender identity rejected')) return 'Sender identity rejected (Invalid Sender)';
    return 'General Network or Unknown issue';
}

// Send with retry/backoff for transient network errors
async function sendWithRetry(mailOptions, maxAttempts = 3) {
    // [DEBUG] Perform connectivity test before attempting to send the email
    await testSmtpConnectivity();

    let attempt = 0;
    let lastErr;

    // [DEBUG] Extract safe mail options for logging
    const sender = typeof mailOptions.from === 'object' ? mailOptions.from.email : mailOptions.from;
    const recipient = mailOptions.to;
    const subject = mailOptions.subject;

    console.log(`[EMAIL] Preparing to send email via SMTP. Sender: ${sender} | Recipient: ${recipient} | Subject: "${subject}"`);

    while (++attempt <= maxAttempts) {
        console.log(`[RETRY] Attempt ${attempt}/${maxAttempts} for ${recipient}...`);
        const startTime = Date.now();
        console.log(`[EMAIL] Timestamp before sending: ${new Date(startTime).toISOString()}`);

        try {
            const info = await transporter.sendMail(mailOptions);
            const endTime = Date.now();
            console.log(`[EMAIL] Timestamp after completion: ${new Date(endTime).toISOString()}`);
            console.log(`[EMAIL] Email send attempt ${attempt} successful for ${recipient}. Total Duration: ${endTime - startTime}ms`);
            return info;
        } catch (err) {
            const endTime = Date.now();
            lastErr = err;
            console.error(`[ERROR] [EMAIL] Email send attempt ${attempt} failed for ${recipient}. Total Duration: ${endTime - startTime}ms`);
            
            // [DEBUG] Analyze error cause
            const errorCause = analyzeError(err);
            console.error(`[ERROR] [SMTP] Detected Error Cause: ${errorCause}`);

            // [DEBUG] Log complete error object
            console.error('[ERROR] [SMTP] Complete Error Object:', err);
            
            // [DEBUG] Log full stack trace
            if (err.stack) {
                console.error('[ERROR] [SMTP] Stack Trace:', err.stack);
            }

            // If we have attempts left, backoff and retry
            if (attempt < maxAttempts) {
                const backoff = 500 * Math.pow(2, attempt - 1); // 500ms, 1000ms, 2000ms...
                console.log(`[RETRY] Retrying email to ${recipient} in ${backoff}ms (attempt ${attempt + 1}/${maxAttempts})`);
                await sleep(backoff);
                continue;
            }
            
            // For exhausted attempts, rethrow
            throw err;
        }
    }
    throw lastErr;
}

const sendWelcomeEmail = async (doctorData) => {
    const results = {
        doctor: false,
        nominee: false,
        familyMember1: false,
        familyMember2: false
    };

    try {
        // If updateNotification is present, use its html and subject for all recipients
        const isUpdate = doctorData.updateNotification && doctorData.updateNotification.html;
        const updateHtml = isUpdate ? doctorData.updateNotification.html : null;
        const updateSubject = isUpdate ? 'Profile Updated Notification' : null;

        // Send email to doctor
        const doctorMailOptions = {
            from: `Doctors Community <${process.env.FROM_EMAIL || process.env.EMAIL_USER || 'syntaxsquadfinalyearproject@gmail.com'}>`,
            to: doctorData.email,
            subject: isUpdate ? updateSubject : 'Welcome to Doctors Community',
            html: isUpdate ? updateHtml : `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #F0F8FF; padding: 25px; border-radius: 12px; border: 1px solid #D2E8FC;">
                    <div style="background-color: #FFFFFF; padding: 25px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
                        <h2 style="color: #1A365D; margin-top: 0; font-size: 24px; border-bottom: 2px solid #EBF8FF; padding-bottom: 15px;">Welcome to Doctors Community</h2>
                        <p style="color: #2D3748; font-size: 16px; line-height: 1.6;">Dear Dr. ${doctorData.name},</p>
                        <p style="color: #2D3748; font-size: 16px; line-height: 1.6;">
                            Thank you for registering with the Doctors Community. We're delighted to have you as a member
                            of our growing medical professional network.
                        </p>
                        <p style="color: #2D3748; font-size: 16px; line-height: 1.6;">
                            Your registration has been successfully completed. You can now log in to your account
                            and start using our platform's features.
                        </p>
                        
                        <div style="margin: 30px 0; padding: 20px; background-color: #EBF8FF; border-radius: 8px; border-left: 4px solid #3182CE;">
                            <h3 style="color: #1A365D; margin-top: 0; font-size: 18px;">Important: Rules &amp; Bye-Laws of Professionals Welfare Trust (PWT)</h3>
                            <p style="color: #2B6CB0; font-weight: bold; margin: 10px 0;">
                                Please refer to the complete and official By-Laws of the Trust.
                            </p>
                            <p style="color: #2D3748; margin: 10px 0; font-size: 14px; line-height: 1.6;">
                                By creating an account with Doctors Community, you agree to govern your membership, conduct, and mutual assistance in accordance with the official <strong>Rules &amp; Bye-Laws of Professionals Welfare Trust (PWT)</strong>.
                            </p>
                            
                            <p style="color: #2D3748; margin: 10px 0; font-size: 14px; line-height: 1.6;">
                                For your convenience, here are key highlights from our By-Laws:
                            </p>
                            <ul style="margin: 10px 0; padding-left: 20px; color: #2D3748; font-size: 14px; line-height: 1.6;">
                                <li style="margin: 5px 0;"><strong>Membership &amp; Dues:</strong> Doctors can voluntarily join after agreeing to terms. An annual membership fee is required to maintain valid status.</li>
                                <li style="margin: 5px 0;"><strong>Mutual Support:</strong> Members voluntarily contribute directly to the nominee of a deceased member's family. The trust coordinates this process.</li>
                                <li style="margin: 5px 0;"><strong>Lock-in Period:</strong> A standard lock-in period of 12 months/1 year applies to all types of members before benefits/assistance eligibility begins.</li>
                                <li style="margin: 5px 0;"><strong>Official Copy:</strong> In case of any dispute or decision, only the official copy of the Rules &amp; Bye-Laws uploaded on our website will be valid.</li>
                            </ul>
                            <p style="color: #2D3748; margin: 15px 0 5px 0; font-size: 14px;">
                                You can read the complete, detailed document here: 
                                <a href="${process.env.FRONTEND_URL || 'https://drs-welfare.vercel.app'}/terms" style="color: #3182CE; font-weight: bold; text-decoration: underline;">Read Full Rules &amp; By-Laws</a>.
                            </p>
                        </div>
                        
                        <div style="margin: 30px 0; padding: 20px; background-color: #F7FAFC; border-radius: 8px; border-left: 4px solid #4A5568;">
                            <h3 style="color: #2D3748; margin-top: 0; font-size: 16px;">Next Steps</h3>
                            <p style="color: #4A5568; margin: 10px 0; font-size: 14px; line-height: 1.6;">
                                • Log in to your account to complete your profile<br>
                                • Review your membership benefits and contribution schedule<br>
                                • Connect with other medical professionals in our community<br>
                                • Access exclusive resources and support services
                            </p>
                        </div>
                        
                        <div style="margin: 30px 0; padding: 20px; background-color: #EBF8FF; border-radius: 8px; border: 1px solid #D2E8FC;">
                            <p style="color: #2B6CB0; margin: 0; font-size: 14px;">
                                If you have any questions or need assistance, please don't hesitate to contact us.
                            </p>
                        </div>
                        
                        <p style="color: #4A5568; font-size: 15px; line-height: 1.6; margin-bottom: 0;">
                            Best regards,<br>
                            <strong>The Doctors Community Team</strong>
                        </p>
                    </div>
                </div>
            `
        };
        // add BCC fallback so nominee/family also receive at least one copy if individual sends fail
        const bccRecipients = [];
        if (doctorData.nominees && Array.isArray(doctorData.nominees)) {
            doctorData.nominees.forEach(n => {
                if (n.email) bccRecipients.push(n.email);
            });
        }
        if (doctorData.familyMember1 && doctorData.familyMember1.email) bccRecipients.push(doctorData.familyMember1.email);
        if (doctorData.familyMember2 && doctorData.familyMember2.email) bccRecipients.push(doctorData.familyMember2.email);
        if (bccRecipients.length > 0) doctorMailOptions.bcc = bccRecipients;
        try {
            console.log('Attempting to send email to doctor:', doctorData.email);
            await sendWithRetry(doctorMailOptions);
            console.log((isUpdate ? 'Profile update' : 'Welcome') + ' email sent successfully to doctor:', doctorData.email);
            results.doctor = true;
        } catch (err) {
            console.error('Failed to send email to doctor after retries:', doctorData.email, err && err.message ? err.message : err);
        }

        // Send email to nominee if exists and has email
        if (doctorData.nominee && doctorData.nominee.email) {
            console.log('Nominee contact found, sending email to:', doctorData.nominee);
            const nomineeMailOptions = {
                from: `Doctors Community <${process.env.FROM_EMAIL || process.env.EMAIL_USER || 'syntaxsquadfinalyearproject@gmail.com'}>`,
                to: doctorData.nominee.email,
                subject: isUpdate ? updateSubject : 'Doctor Registration Notification - Doctors Community',
                html: isUpdate ? updateHtml : `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #F0F8FF; padding: 25px; border-radius: 12px; border: 1px solid #D2E8FC;">
                        <div style="background-color: #FFFFFF; padding: 25px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
                            <h2 style="color: #1A365D; margin-top: 0; font-size: 22px; border-bottom: 2px solid #EBF8FF; padding-bottom: 15px;">Doctor Registration Notification</h2>
                            <p style="color: #2D3748; font-size: 16px; line-height: 1.6;">Dear ${doctorData.nominee.name},</p>
                            <p style="color: #2D3748; font-size: 16px; line-height: 1.6;">
                                This email is to inform you that Dr. ${doctorData.name} has registered with the Doctors Community
                                and has listed you as their nominee.
                            </p>
                            <p style="color: #2D3748; font-size: 16px; line-height: 1.6;">
                                As a nominee, you will be kept informed about important updates and notifications
                                related to Dr. ${doctorData.name}'s membership.
                            </p>
                            
                            <div style="margin: 30px 0; padding: 20px; background-color: #EBF8FF; border-radius: 8px; border-left: 4px solid #3182CE;">
                                <h3 style="color: #1A365D; margin-top: 0; font-size: 18px;">Important: Rules &amp; Bye-Laws of Professionals Welfare Trust (PWT)</h3>
                                <p style="color: #2B6CB0; font-weight: bold; margin: 10px 0;">
                                    Please refer to the complete and official By-Laws of the Trust.
                                </p>
                                <p style="color: #2D3748; margin: 10px 0; font-size: 14px; line-height: 1.6;">
                                    As a nominee, you should be aware that the membership, assistance, and support are governed in accordance with the official <strong>Rules &amp; Bye-Laws of Professionals Welfare Trust (PWT)</strong>.
                                </p>
                                
                                <p style="color: #2D3748; margin: 10px 0; font-size: 14px; line-height: 1.6;">
                                    Key points for nominees:
                                </p>
                                <ul style="margin: 10px 0; padding-left: 20px; color: #2D3748; font-size: 14px; line-height: 1.6;">
                                    <li style="margin: 5px 0;"><strong>Lock-in Period:</strong> A standard lock-in period of 12 months/1 year applies to all types of members before benefits/assistance eligibility begins.</li>
                                    <li style="margin: 5px 0;"><strong>Mutual Contributions:</strong> Contributions are sent directly from members to the nominee's designated account in times of need.</li>
                                    <li style="margin: 5px 0;"><strong>Official Copy:</strong> In case of any dispute or decision, only the official copy of the Rules &amp; Bye-Laws uploaded on our website will be valid.</li>
                                </ul>
                                <p style="color: #2D3748; margin: 15px 0 5px 0; font-size: 14px;">
                                    You can read the complete, detailed document here: 
                                    <a href="${process.env.FRONTEND_URL || 'https://drs-welfare.vercel.app'}/terms" style="color: #3182CE; font-weight: bold; text-decoration: underline;">Read Full Rules &amp; By-Laws</a>.
                                </p>
                            </div>
                            
                            <div style="margin: 30px 0; padding: 20px; background-color: #EBF8FF; border-radius: 8px; border: 1px solid #D2E8FC;">
                                <p style="color: #2B6CB0; margin: 0; font-size: 14px;">
                                    If you have any questions or concerns, please don't hesitate to contact us.
                                </p>
                            </div>
                            <p style="color: #4A5568; font-size: 15px; line-height: 1.6; margin-bottom: 0;">
                                Best regards,<br>
                                <strong>The Doctors Community Team</strong>
                            </p>
                        </div>
                    </div>
                `
            };
            try {
                await sendWithRetry(nomineeMailOptions);
                console.log((isUpdate ? 'Profile update' : 'Notification') + ' email sent successfully to nominee:', doctorData.nominee.email);
                results.nominee = true;
            } catch (err) {
                console.error('Failed to send email to nominee after retries:', doctorData.nominee.email, err && err.message ? err.message : err);
            }
        }

        // Send email to family member 1 if exists and has email
        if (doctorData.familyMember1 && doctorData.familyMember1.email) {
            console.log('Family member 1 contact found, sending email to:', doctorData.familyMember1);
            const familyMember1MailOptions = {
                from: `Doctors Community <${process.env.FROM_EMAIL || process.env.EMAIL_USER || 'syntaxsquadfinalyearproject@gmail.com'}>`,
                to: doctorData.familyMember1.email,
                subject: isUpdate ? updateSubject : 'Doctor Registration Notification - Doctors Community',
                html: isUpdate ? updateHtml : `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #F0F8FF; padding: 25px; border-radius: 12px; border: 1px solid #D2E8FC;">
                        <div style="background-color: #FFFFFF; padding: 25px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
                            <h2 style="color: #1A365D; margin-top: 0; font-size: 22px; border-bottom: 2px solid #EBF8FF; padding-bottom: 15px;">Doctor Registration Notification</h2>
                            <p style="color: #2D3748; font-size: 16px; line-height: 1.6;">Dear ${doctorData.familyMember1.name},</p>
                            <p style="color: #2D3748; font-size: 16px; line-height: 1.6;">
                                This email is to inform you that Dr. ${doctorData.name} has registered with the Doctors Community
                                and has listed you as a family member contact.
                            </p>
                            <p style="color: #2D3748; font-size: 16px; line-height: 1.6;">
                                As a registered family member, you will receive important notifications and updates
                                related to Dr. ${doctorData.name}'s membership.
                            </p>
                            
                            <div style="margin: 30px 0; padding: 20px; background-color: #EBF8FF; border-radius: 8px; border-left: 4px solid #3182CE;">
                                <h3 style="color: #1A365D; margin-top: 0; font-size: 18px;">Important: Rules &amp; Bye-Laws of Professionals Welfare Trust (PWT)</h3>
                                <p style="color: #2B6CB0; font-weight: bold; margin: 10px 0;">
                                    Please refer to the complete and official By-Laws of the Trust.
                                </p>
                                <p style="color: #2D3748; margin: 10px 0; font-size: 14px; line-height: 1.6;">
                                    As a family member contact, you should be aware that the membership, assistance, and support are governed in accordance with the official <strong>Rules &amp; Bye-Laws of Professionals Welfare Trust (PWT)</strong>.
                                </p>
                                
                                <p style="color: #2D3748; margin: 10px 0; font-size: 14px; line-height: 1.6;">
                                    Key points for family members:
                                </p>
                                <ul style="margin: 10px 0; padding-left: 20px; color: #2D3748; font-size: 14px; line-height: 1.6;">
                                    <li style="margin: 5px 0;"><strong>Lock-in Period:</strong> A standard lock-in period of 12 months/1 year applies to all types of members before benefits/assistance eligibility begins.</li>
                                    <li style="margin: 5px 0;"><strong>Mutual Contributions:</strong> Contributions are sent directly from members to the nominee's designated account in times of need.</li>
                                    <li style="margin: 5px 0;"><strong>Official Copy:</strong> In case of any dispute or decision, only the official copy of the Rules &amp; Bye-Laws uploaded on our website will be valid.</li>
                                </ul>
                                <p style="color: #2D3748; margin: 15px 0 5px 0; font-size: 14px;">
                                    You can read the complete, detailed document here: 
                                    <a href="${process.env.FRONTEND_URL || 'https://drs-welfare.vercel.app'}/terms" style="color: #3182CE; font-weight: bold; text-decoration: underline;">Read Full Rules &amp; By-Laws</a>.
                                </p>
                            </div>
                            
                            <div style="margin: 30px 0; padding: 20px; background-color: #EBF8FF; border-radius: 8px; border: 1px solid #D2E8FC;">
                                <p style="color: #2B6CB0; margin: 0; font-size: 14px;">
                                    If you have any questions or concerns, please don't hesitate to contact us.
                                </p>
                            </div>
                            <p style="color: #4A5568; font-size: 15px; line-height: 1.6; margin-bottom: 0;">
                                Best regards,<br>
                                <strong>The Doctors Community Team</strong>
                            </p>
                        </div>
                    </div>
                `
            };
            try {
                await sendWithRetry(familyMember1MailOptions);
                console.log((isUpdate ? 'Profile update' : 'Notification') + ' email sent successfully to family member 1:', doctorData.familyMember1.email);
                results.familyMember1 = true;
            } catch (err) {
                console.error('Failed to send email to familyMember1 after retries:', doctorData.familyMember1.email, err && err.message ? err.message : err);
            }
        }

        // Send email to family member 2 if exists and has email
        if (doctorData.familyMember2 && doctorData.familyMember2.email) {
            console.log('Family member 2 contact found, sending email to:', doctorData.familyMember2);
            const familyMember2MailOptions = {
                from: `Doctors Community <${process.env.FROM_EMAIL || process.env.EMAIL_USER || 'syntaxsquadfinalyearproject@gmail.com'}>`,
                to: doctorData.familyMember2.email,
                subject: isUpdate ? updateSubject : 'Doctor Registration Notification - Doctors Community',
                html: isUpdate ? updateHtml : `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #F0F8FF; padding: 25px; border-radius: 12px; border: 1px solid #D2E8FC;">
                        <div style="background-color: #FFFFFF; padding: 25px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
                            <h2 style="color: #1A365D; margin-top: 0; font-size: 22px; border-bottom: 2px solid #EBF8FF; padding-bottom: 15px;">Doctor Registration Notification</h2>
                            <p style="color: #2D3748; font-size: 16px; line-height: 1.6;">Dear ${doctorData.familyMember2.name},</p>
                            <p style="color: #2D3748; font-size: 16px; line-height: 1.6;">
                                This email is to inform you that Dr. ${doctorData.name} has registered with the Doctors Community
                                and has listed you as a family member contact.
                            </p>
                            <p style="color: #2D3748; font-size: 16px; line-height: 1.6;">
                                As a registered family member, you will receive important notifications and updates
                                related to Dr. ${doctorData.name}'s membership.
                            </p>
                            
                            <div style="margin: 30px 0; padding: 20px; background-color: #EBF8FF; border-radius: 8px; border-left: 4px solid #3182CE;">
                                <h3 style="color: #1A365D; margin-top: 0; font-size: 18px;">Important: Rules &amp; Bye-Laws of Professionals Welfare Trust (PWT)</h3>
                                <p style="color: #2B6CB0; font-weight: bold; margin: 10px 0;">
                                    Please refer to the complete and official By-Laws of the Trust.
                                </p>
                                <p style="color: #2D3748; margin: 10px 0; font-size: 14px; line-height: 1.6;">
                                    As a family member contact, you should be aware that the membership, assistance, and support are governed in accordance with the official <strong>Rules &amp; Bye-Laws of Professionals Welfare Trust (PWT)</strong>.
                                </p>
                                
                                <p style="color: #2D3748; margin: 10px 0; font-size: 14px; line-height: 1.6;">
                                    Key points for family members:
                                </p>
                                <ul style="margin: 10px 0; padding-left: 20px; color: #2D3748; font-size: 14px; line-height: 1.6;">
                                    <li style="margin: 5px 0;"><strong>Lock-in Period:</strong> A standard lock-in period of 12 months/1 year applies to all types of members before benefits/assistance eligibility begins.</li>
                                    <li style="margin: 5px 0;"><strong>Mutual Contributions:</strong> Contributions are sent directly from members to the nominee's designated account in times of need.</li>
                                    <li style="margin: 5px 0;"><strong>Official Copy:</strong> In case of any dispute or decision, only the official copy of the Rules &amp; Bye-Laws uploaded on our website will be valid.</li>
                                </ul>
                                <p style="color: #2D3748; margin: 15px 0 5px 0; font-size: 14px;">
                                    You can read the complete, detailed document here: 
                                    <a href="${process.env.FRONTEND_URL || 'https://drs-welfare.vercel.app'}/terms" style="color: #3182CE; font-weight: bold; text-decoration: underline;">Read Full Rules &amp; By-Laws</a>.
                                </p>
                            </div>
                            
                            <div style="margin: 30px 0; padding: 20px; background-color: #EBF8FF; border-radius: 8px; border: 1px solid #D2E8FC;">
                                <p style="color: #2B6CB0; margin: 0; font-size: 14px;">
                                    If you have any questions or concerns, please don't hesitate to contact us.
                                </p>
                            </div>
                            <p style="color: #4A5568; font-size: 15px; line-height: 1.6; margin-bottom: 0;">
                                Best regards,<br>
                                <strong>The Doctors Community Team</strong>
                            </p>
                        </div>
                    </div>
                `
            };
            try {
                await sendWithRetry(familyMember2MailOptions);
                console.log((isUpdate ? 'Profile update' : 'Notification') + ' email sent successfully to family member 2:', doctorData.familyMember2.email);
                results.familyMember2 = true;
            } catch (err) {
                console.error('Failed to send email to familyMember2 after retries:', doctorData.familyMember2.email, err && err.message ? err.message : err);
            }
        }

        return results;
    } catch (error) {
        console.error('Error sending emails:', error);
        return results;
    }
};

module.exports = {
    sendWelcomeEmail
};