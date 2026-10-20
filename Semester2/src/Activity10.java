import javax.swing.*;
import java.awt.*;
import java.util.Timer;
import java.util.TimerTask;

public class Activity10 {
    private static int countdown = 10;

    public static void main(String[] args) {
        SwingUtilities.invokeLater(() -> {

            JFrame frame = new JFrame("Countdown Timer");

            frame.setSize(400, 200);
            frame.setLocationRelativeTo(null);
            frame.setDefaultCloseOperation(JFrame.EXIT_ON_CLOSE);

            //Define custom method

            JPanel countdownPanel = createCountdownPanel();

            frame.add(countdownPanel);

            frame.setVisible(true);

        });
    }

    public static JPanel createCountdownPanel(){
        JPanel panel = new JPanel(new GridLayout());

        JLabel countdownLabel = new JLabel("Countdown: " + countdown);
        countdownLabel.setFont(countdownLabel.getFont().deriveFont(Font.BOLD, 32f));
        // letter f is for float

        panel.add(countdownLabel);

        //passing
        startCountdown(countdownLabel);

        return panel;
    }

    //Start countdown
    // timer, timertask
    // The method has a void return type because it performs an action but doesnt return a value
    // startcountodwn method is not called directly in the main method because the timerneeds to access
    // the countdown label
    public static void startCountdown(JLabel countdownLabel) {
        //create timer
      //  timertask is an abstract class representing the work that needs to be performed

        Timer timer = new Timer();
        timer.scheduleAtFixedRate(new TimerTask() {
            public void run() {
                countdown--;
                if (countdown >= 0) {
                    countdownLabel.setText("Countdown: " + countdown);
                }
                if (countdown == 0) {
                    countdownLabel.setText("Sausage Chutney");
                    timer.cancel();
                }
            }
        }, 1000, 1000);
    }
}
/*
Timertask countdownTimer = new TimerTask;
@override
public void run(){
    //decrease countodwn value            --operator
    countdown--;
    // store copy of the current value
    final int currentValue = countdown;

    Swingutilities.invokelater(()->{
       if (currentValues >= 0) {
                    countdownLabel.setText("Countdown: " + currentvalue);
                }
                if (currentvalues == 0) {
                    countdownLabel.setText("Time's Up!");
                    timer.cancel();
                }
    });
    // stop thread
    if

}

 */