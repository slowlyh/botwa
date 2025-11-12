import { pakasir } from '#lib/pakasir'
import { delay } from 'baileys'

const activeDonations = new Map()

/**
 * QRIS Donation Plugin
 * Allows users to donate via QRIS payment
 */
export default {
  name: 'donate',
  description: 'Donasi via QRIS Pakasir',
  category: 'main',
  command: ['donate', 'donasi', 'traktir'],
  
  settings: {
    wait: false,
    cooldown: 50,
  },
  
  code: async (sock, m, Func) => {
    const nominal = parseInt(m.text?.trim())

    // Validate input
    if (!nominal || isNaN(nominal)) {
      return m.reply(
        `💰 *Donate*\n\n` +
        `Masukkan nominal donasi!\n\n` +
        `*Contoh:*\n` +
        `.donate 5000\n` +
        `.donasi 10000\n` +
        `.traktir 50000\n\n` +
        `*Ketentuan:*\n` +
        `• Minimal: Rp 1.000\n` +
        `• Maksimal: Rp 1.000.000\n` +
        `• Biaya admin ditanggung oleh pengirim`
      )
    }

    // Validate amount
    if (nominal < 1000) {
      return m.reply('❌ Minimal donasi Rp 1.000')
    }

    if (nominal > 1000000) {
      return m.reply('❌ Maksimal donasi Rp 1.000.000')
    }

    // Check if user has active donation
    if (activeDonations.has(m.sender)) {
      return m.reply('⏳ Kamu masih punya donasi yang belum selesai. Tunggu sampai expired atau selesai.')
    }

    try {
      await m.react('⏳')

      // Create QRIS payment
      const qris = await pakasir.createQris(nominal)

      // Format expired time
      const expiredAt = new Date(qris.expired_at)
      const expiredTime = expiredAt.toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'Asia/Jakarta'
      })

      // Format currency
      const formatRupiah = (amount) => {
        return new Intl.NumberFormat('id-ID', {
          style: 'currency',
          currency: 'IDR',
          minimumFractionDigits: 0
        }).format(amount)
      }

      // Generate QR code image
      const qrImageUrl = pakasir.generateQrUrl(qris.payment_number)

      // Send QRIS image with details
      const caption = 
        `💰 *QRIS DONATION*\n\n` +
        `Scan QR code untuk melakukan pembayaran\n\n` +
        `📝 *Detail:*\n` +
        `• Order ID: #${qris.order_id}\n` +
        `• Nominal: ${formatRupiah(nominal)}\n` +
        `• Biaya Admin: ${formatRupiah(qris.fee)}\n` +
        `• Total Bayar: ${formatRupiah(qris.total_payment)}\n` +
        `• Expired: ${expiredTime} WIB\n\n` +
        `_Pembayaran akan otomatis terverifikasi_`

      const sentQris = await m.reply({ image: { url: qrImageUrl }, caption: caption })

      // Mark as active donation
      activeDonations.set(m.sender, {
        orderId: qris.order_id,
        amount: nominal,
        messageKey: sentQris.key
      })

      await m.react('✅')

      // Start checking payment status
      let status = ''
      let checkCount = 0
      const maxChecks = 120 // 10 minutes (5s interval)

      while (status !== 'completed' && checkCount < maxChecks) {
        // Check if expired
        if (new Date() >= expiredAt) {
          await sock.sendMessage(m.chat, { delete: sentQris.key })
          activeDonations.delete(m.sender)
          
          return m.reply(
            `⏱️ *QRIS Expired*\n\n` +
            `Order ID: #${qris.order_id}\n` +
            `Pembayaran sudah tidak dapat diproses.\n\n` +
            `Silakan buat donasi baru jika masih ingin berdonasi.`
          )
        }

        // Check payment status
        try {
          const transaction = await pakasir.checkStatus(qris.order_id, nominal)
          
          if (transaction && transaction.status === 'completed') {
            status = 'completed'
            
            // Delete QRIS message
            await sock.sendMessage(m.chat, { delete: sentQris.key })
            
            // Remove from active donations
            activeDonations.delete(m.sender)
            
            // Send success message
            await m.react('🎉')
            await m.reply(
              `🎉 *Donasi Berhasil!*\n\n` +
              `Terima kasih atas donasi sebesar ${formatRupiah(qris.total_payment)}\n\n` +
              `Order ID: #${qris.order_id}\n\n` +
              `Dukungan kamu sangat berarti! 💖`
            )
            
            return
          }
        } catch (error) {
          console.error('[DONATE] Status check error:', error)
        }

        // Wait 5 seconds before next check
        await delay(5000)
        checkCount++
      }

      // If reached max checks without completion
      if (checkCount >= maxChecks) {
        await sock.sendMessage(m.chat, { delete: sentQris.key })
        activeDonations.delete(m.sender)
        
        return m.reply(
          `⏱️ *Timeout*\n\n` +
          `Order ID: #${qris.order_id}\n` +
          `Pengecekan status pembayaran timeout.\n\n` +
          `Jika sudah bayar, tunggu beberapa saat dan cek manual.`
        )
      }

    } catch (error) {
      console.error('[DONATE ERROR]:', error)
      await m.react('❌')
      
      activeDonations.delete(m.sender)
      
      let errorMsg = '❌ Terjadi kesalahan saat membuat donasi.'
      
      if (error.message?.includes('API key')) {
        errorMsg = '❌ Konfigurasi Pakasir belum diatur dengan benar.'
      } else if (error.message?.includes('Minimum')) {
        errorMsg = error.message
      } else {
        errorMsg += `\n\n_${error.message}_`
      }
      
      return m.reply(errorMsg)
    }
  }
}